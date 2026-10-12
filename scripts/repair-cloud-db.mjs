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
UPDATE public.paragens p
SET hora_prevista = r.hora_inicio + ((r.hora_fim - r.hora_inicio) / 2)
FROM public.rotas r
WHERE p.rota_id = r.id
  AND p.hora_prevista IS NULL
  AND p.ordem > 1
  AND p.ordem < (SELECT max(p2.ordem) FROM public.paragens p2 WHERE p2.rota_id = r.id)
  AND r.hora_inicio IS NOT NULL
  AND r.hora_fim IS NOT NULL;
DROP POLICY IF EXISTS rotas_select_passageiro_agendadas ON public.rotas;
CREATE POLICY rotas_select_passageiro_agendadas ON public.rotas
FOR SELECT TO authenticated
USING (
  public.conta_activa()
  AND estado = 'agendada'
  AND data_viagem >= (now() AT TIME ZONE 'Africa/Maputo')::date
);
DROP POLICY IF EXISTS paragens_select_passageiro_agendadas ON public.paragens;
CREATE POLICY paragens_select_passageiro_agendadas ON public.paragens
FOR SELECT TO authenticated
USING (
  public.conta_activa()
  AND EXISTS (
    SELECT 1 FROM public.rotas r
    WHERE r.id = paragens.rota_id
      AND r.estado = 'agendada'
      AND r.data_viagem >= (now() AT TIME ZONE 'Africa/Maputo')::date
  )
);
CREATE OR REPLACE FUNCTION public.reservar_viagem_passageiro(
  _rota_id uuid,
  _paragem_embarque_id uuid,
  _paragem_desembarque_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _passageiro_id uuid;
  _rota record;
  _origem record;
  _destino record;
  _hora time;
  _partida timestamptz;
  _capacidade integer;
  _ocupados integer;
  _min_ordem integer;
  _max_ordem integer;
  _inicio_min integer;
  _fim_min integer;
  _hora_min integer;
  _viagem_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Inicie sessão para confirmar a viagem.'; END IF;
  IF NOT public.conta_activa() OR NOT public.has_role(_uid, 'passageiro') THEN
    RAISE EXCEPTION 'Apenas uma conta de passageiro activa pode reservar esta viagem.';
  END IF;

  SELECT id INTO _passageiro_id FROM public.passageiros WHERE user_id = _uid LIMIT 1;
  IF _passageiro_id IS NULL THEN RAISE EXCEPTION 'Não existe um perfil de passageiro associado à sua conta.'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_passageiro_id::text, 0));

  SELECT r.id, r.nome, r.estado, r.data_viagem, r.hora_inicio, r.hora_fim, r.veiculo_id, v.lugares AS capacidade
    INTO _rota
    FROM public.rotas r
    LEFT JOIN public.veiculos v ON v.id = r.veiculo_id
    WHERE r.id = _rota_id
    FOR UPDATE OF r;
  IF NOT FOUND THEN RAISE EXCEPTION 'Esta viagem já não está disponível para reserva.'; END IF;
  IF _rota.estado <> 'agendada' OR _rota.data_viagem IS NULL OR _rota.veiculo_id IS NULL
     OR _rota.data_viagem < (now() AT TIME ZONE 'Africa/Maputo')::date THEN
    RAISE EXCEPTION 'Esta viagem ainda não está agendada com data e autocarro disponíveis.';
  END IF;

  SELECT * INTO _origem FROM public.paragens
    WHERE id = _paragem_embarque_id AND rota_id = _rota_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'O ponto de partida não pertence a esta rota.'; END IF;

  SELECT * INTO _destino FROM public.paragens
    WHERE id = _paragem_desembarque_id AND rota_id = _rota_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'O destino não pertence a esta rota.'; END IF;
  IF _origem.ordem >= _destino.ordem THEN
    RAISE EXCEPTION 'O ponto de partida deve aparecer antes do destino na rota.';
  END IF;

  SELECT min(ordem), max(ordem) INTO _min_ordem, _max_ordem
    FROM public.paragens WHERE rota_id = _rota_id;
  _hora := _origem.hora_prevista;
  IF _hora IS NULL AND _origem.ordem = _min_ordem THEN _hora := _rota.hora_inicio; END IF;
  IF _hora IS NULL AND _origem.ordem = _max_ordem THEN _hora := _rota.hora_fim; END IF;
  IF _hora IS NULL AND _rota.hora_inicio IS NOT NULL AND _rota.hora_fim IS NOT NULL THEN
    _inicio_min := extract(hour FROM _rota.hora_inicio)::integer * 60 + extract(minute FROM _rota.hora_inicio)::integer;
    _fim_min := extract(hour FROM _rota.hora_fim)::integer * 60 + extract(minute FROM _rota.hora_fim)::integer;
    IF _fim_min < _inicio_min THEN _fim_min := _fim_min + 1440; END IF;
    _hora_min := round(_inicio_min + (_fim_min - _inicio_min) * (_origem.ordem - _min_ordem)::numeric / greatest(_max_ordem - _min_ordem, 1))::integer % 1440;
    _hora := make_time((_hora_min / 60)::integer, (_hora_min % 60)::integer, 0);
  END IF;
  IF _hora IS NULL THEN RAISE EXCEPTION 'O operador ainda não definiu o horário desta paragem.'; END IF;

  _partida := (_rota.data_viagem + _hora) AT TIME ZONE 'Africa/Maputo';
  IF now() >= _partida - interval '10 minutes' THEN
    RAISE EXCEPTION 'O embarque fecha 10 minutos antes da partida.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.viagens_passageiro
    WHERE passageiro_id = _passageiro_id AND estado IN ('pendente', 'a_bordo', 'desembarcado')
  ) THEN RAISE EXCEPTION 'Já tem uma viagem activa. Conclua ou cancele a viagem actual antes de reservar outra.'; END IF;

  _capacidade := _rota.capacidade;
  IF _capacidade IS NOT NULL AND _capacidade > 0 THEN
    SELECT count(*)::integer INTO _ocupados FROM public.viagens_passageiro
      WHERE rota_id = _rota_id AND estado IN ('pendente', 'a_bordo', 'desembarcado');
    IF _ocupados >= _capacidade THEN RAISE EXCEPTION 'Esta viagem já não tem lugares disponíveis.'; END IF;
  END IF;

  INSERT INTO public.viagens_passageiro (rota_id, passageiro_id, paragem_embarque_id, paragem_desembarque_id, estado)
    VALUES (_rota_id, _passageiro_id, _paragem_embarque_id, _paragem_desembarque_id, 'pendente')
    RETURNING id INTO _viagem_id;

  INSERT INTO public.notificacoes (user_id, tipo, mensagem)
  SELECT DISTINCT pu.user_id, 'reserva',
    'Nova reserva confirmada: ' || _rota.nome || ' · ' || _origem.nome || ' → ' || _destino.nome || ' · ' || to_char(_rota.data_viagem, 'DD/MM/YYYY')
  FROM public.papeis_utilizador pu
  WHERE pu.role IN ('operador', 'admin');

  RETURN _viagem_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.reservar_viagem_passageiro(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reservar_viagem_passageiro(uuid, uuid, uuid) TO authenticated;
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
