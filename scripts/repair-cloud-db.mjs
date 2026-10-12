import postgres from "postgres";

const SQL = String.raw`ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'responsavel_grupo';
-- SPLIT_AFTER_ENUM
CREATE TABLE IF NOT EXISTS public.pontos_predefinidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_pontos_predefinidos_nome
  ON public.pontos_predefinidos (lower(trim(nome)));
ALTER TABLE public.rotas
  ADD COLUMN IF NOT EXISTS ponto_partida_id uuid REFERENCES public.pontos_predefinidos(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS ponto_chegada_id uuid REFERENCES public.pontos_predefinidos(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS paragem_id uuid REFERENCES public.pontos_predefinidos(id) ON DELETE RESTRICT;
ALTER TABLE public.pontos_predefinidos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pontos_predefinidos_select ON public.pontos_predefinidos;
CREATE POLICY pontos_predefinidos_select ON public.pontos_predefinidos
FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS pontos_predefinidos_admin_insert ON public.pontos_predefinidos;
CREATE POLICY pontos_predefinidos_admin_insert ON public.pontos_predefinidos
FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS pontos_predefinidos_admin_update ON public.pontos_predefinidos;
CREATE POLICY pontos_predefinidos_admin_update ON public.pontos_predefinidos
FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS pontos_predefinidos_admin_delete ON public.pontos_predefinidos;
CREATE POLICY pontos_predefinidos_admin_delete ON public.pontos_predefinidos
FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
ALTER TABLE public.papeis_utilizador ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS papeis_admin_manage ON public.papeis_utilizador;
CREATE POLICY papeis_admin_manage ON public.papeis_utilizador
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE OR REPLACE FUNCTION public.criar_rota_operacional(
  _nome text DEFAULT NULL,
  _veiculo_id uuid DEFAULT NULL,
  _motorista_id uuid DEFAULT NULL,
  _ponto_partida_id uuid DEFAULT NULL,
  _ponto_chegada_id uuid DEFAULT NULL,
  _paragem_id uuid DEFAULT NULL,
  _hora_inicio time DEFAULT NULL,
  _hora_fim time DEFAULT NULL,
  _passageiros_previstos integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _rota_id uuid;
  _nome_partida text;
  _nome_chegada text;
  _nome_paragem text;
BEGIN
  IF auth.uid() IS NULL OR (
    NOT public.has_role(auth.uid(), 'admin')
    AND NOT public.has_role(auth.uid(), 'operador')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para criar uma rota';
  END IF;
  IF _ponto_partida_id IS NULL OR _ponto_chegada_id IS NULL THEN
    RAISE EXCEPTION 'A rota deve ter ponto de partida e ponto de chegada';
  END IF;
  IF _ponto_partida_id = _ponto_chegada_id THEN
    RAISE EXCEPTION 'O ponto de partida e o ponto de chegada devem ser diferentes';
  END IF;
  IF _paragem_id IS NOT NULL
     AND (_paragem_id = _ponto_partida_id OR _paragem_id = _ponto_chegada_id) THEN
    RAISE EXCEPTION 'A paragem intermédia deve ser diferente da partida e da chegada';
  END IF;
  SELECT nome INTO _nome_partida FROM public.pontos_predefinidos
  WHERE id = _ponto_partida_id AND activo = true;
  SELECT nome INTO _nome_chegada FROM public.pontos_predefinidos
  WHERE id = _ponto_chegada_id AND activo = true;
  IF _nome_partida IS NULL OR _nome_chegada IS NULL THEN
    RAISE EXCEPTION 'O ponto de partida ou chegada não está disponível';
  END IF;
  IF _paragem_id IS NOT NULL THEN
    SELECT nome INTO _nome_paragem FROM public.pontos_predefinidos
    WHERE id = _paragem_id AND activo = true;
    IF _nome_paragem IS NULL THEN
      RAISE EXCEPTION 'A paragem intermédia não está disponível';
    END IF;
  END IF;
  INSERT INTO public.rotas (
    nome, veiculo_id, motorista_id, hora_inicio, hora_fim,
    passageiros_previstos, ponto_partida_id, ponto_chegada_id, paragem_id, estado
  )
  VALUES (
    COALESCE(NULLIF(trim(_nome), ''), _nome_partida || ' → ' || _nome_chegada),
    _veiculo_id, _motorista_id, _hora_inicio, _hora_fim,
    _passageiros_previstos, _ponto_partida_id, _ponto_chegada_id, _paragem_id, 'rascunho'
  )
  RETURNING id INTO _rota_id;
  INSERT INTO public.paragens (rota_id, nome, ordem, hora_prevista)
  VALUES (_rota_id, _nome_partida, 1, _hora_inicio);
  IF _paragem_id IS NOT NULL THEN
    INSERT INTO public.paragens (rota_id, nome, ordem, hora_prevista)
    VALUES (_rota_id, _nome_paragem, 2, NULL);
  END IF;
  INSERT INTO public.paragens (rota_id, nome, ordem, hora_prevista)
  VALUES (
    _rota_id, _nome_chegada,
    CASE WHEN _paragem_id IS NULL THEN 2 ELSE 3 END,
    _hora_fim
  );
  RETURN _rota_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.criar_rota_operacional(text, uuid, uuid, uuid, uuid, uuid, time, time, integer)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_rota_operacional(text, uuid, uuid, uuid, uuid, uuid, time, time, integer)
TO authenticated;

-- Códigos QR/scan compactos de 8 caracteres. Só migra tokens antigos uma vez.
CREATE OR REPLACE FUNCTION public.gerar_token_qr_curto()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $function$
DECLARE _token text;
BEGIN
  LOOP
    _token := translate(encode(gen_random_bytes(6), 'base64'), '+/', '-_');
    IF length(_token) = 8
       AND NOT EXISTS (SELECT 1 FROM public.viagens_passageiro WHERE token_qr = _token) THEN
      RETURN _token;
    END IF;
  END LOOP;
END;
$function$;
ALTER TABLE public.viagens_passageiro
  ALTER COLUMN token_qr SET DEFAULT public.gerar_token_qr_curto();
UPDATE public.viagens_passageiro
SET token_qr = public.gerar_token_qr_curto()
WHERE length(token_qr) <> 8;

-- Preferências de histórico pessoal: esconder sem apagar os dados operacionais.
CREATE TABLE IF NOT EXISTS public.historico_ocultos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entidade_tipo text NOT NULL,
  entidade_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT historico_ocultos_unq UNIQUE (user_id, entidade_tipo, entidade_id)
);
ALTER TABLE public.historico_ocultos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS historico_ocultos_select_proprio ON public.historico_ocultos;
CREATE POLICY historico_ocultos_select_proprio ON public.historico_ocultos
FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS historico_ocultos_insert_proprio ON public.historico_ocultos;
CREATE POLICY historico_ocultos_insert_proprio ON public.historico_ocultos
FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS historico_ocultos_delete_proprio ON public.historico_ocultos;
CREATE POLICY historico_ocultos_delete_proprio ON public.historico_ocultos
FOR DELETE TO authenticated USING (user_id = auth.uid());

ALTER TABLE public.rotas ADD COLUMN IF NOT EXISTS data_viagem date;
CREATE INDEX IF NOT EXISTS idx_rotas_data_estado ON public.rotas(data_viagem, estado);
NOTIFY pgrst, 'reload schema';`;
const candidates = [
  process.env.LOVABLE_DB_MIGRATION_URL,
  process.env.DATABASE_URL,
  process.env.POSTGRES_URL_NON_POOLING,
  process.env.POSTGRES_URL,
  process.env.SUPABASE_DB_URL,
  process.env.SUPABASE_DB_CONNECTION_STRING,
].filter(Boolean);

async function run(url) {
  const sql = postgres(url, { max: 1, connect_timeout: 8, idle_timeout: 5 });
  try {
    const [enumSql, remainingSql] = SQL.split("\n-- SPLIT_AFTER_ENUM\n");
    await sql.unsafe(enumSql);
    await sql.unsafe(remainingSql);
  } finally {
    await sql.end();
  }
}

if (!candidates.length) {
  console.log("[db] No direct PostgreSQL connection string available; skipping Cloud repair.");
} else {
  let repaired = false;
  for (const url of candidates) {
    try {
      console.log("[db] Applying idempotent Cloud schema repair...");
      await run(url);
      console.log("[db] Cloud schema repair completed.");
      repaired = true;
      break;
    } catch (error) {
      console.error("[db] Repair candidate failed:", error instanceof Error ? error.message : error);
    }
  }
  if (!repaired) console.error("[db] No available PostgreSQL connection accepted the repair; continuing without blocking the build.");
}
