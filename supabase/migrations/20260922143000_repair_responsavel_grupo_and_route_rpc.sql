-- Embarque Inteligente — reparação do backend Lovable Cloud
-- Não elimina dados. Garante que o papel Responsável de Grupo e a RPC de criação
-- de rotas existem no mesmo contrato usado pelo frontend/PostgREST.

ALTER TYPE public.app_role
  ADD VALUE IF NOT EXISTS 'responsavel_grupo';

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
CREATE POLICY pontos_predefinidos_select
ON public.pontos_predefinidos
FOR SELECT TO authenticated
USING (public.conta_activa());

DROP POLICY IF EXISTS pontos_predefinidos_admin_insert ON public.pontos_predefinidos;
CREATE POLICY pontos_predefinidos_admin_insert
ON public.pontos_predefinidos
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS pontos_predefinidos_admin_update ON public.pontos_predefinidos;
CREATE POLICY pontos_predefinidos_admin_update
ON public.pontos_predefinidos
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS pontos_predefinidos_admin_delete ON public.pontos_predefinidos;
CREATE POLICY pontos_predefinidos_admin_delete
ON public.pontos_predefinidos
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

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
  IF auth.uid() IS NULL
     OR (
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

  SELECT nome INTO _nome_partida
  FROM public.pontos_predefinidos
  WHERE id = _ponto_partida_id AND activo = true;

  SELECT nome INTO _nome_chegada
  FROM public.pontos_predefinidos
  WHERE id = _ponto_chegada_id AND activo = true;

  IF _nome_partida IS NULL OR _nome_chegada IS NULL THEN
    RAISE EXCEPTION 'O ponto de partida ou chegada não está disponível';
  END IF;

  IF _paragem_id IS NOT NULL THEN
    SELECT nome INTO _nome_paragem
    FROM public.pontos_predefinidos
    WHERE id = _paragem_id AND activo = true;

    IF _nome_paragem IS NULL THEN
      RAISE EXCEPTION 'A paragem intermédia não está disponível';
    END IF;
  END IF;

  INSERT INTO public.rotas (
    nome,
    veiculo_id,
    motorista_id,
    hora_inicio,
    hora_fim,
    passageiros_previstos,
    ponto_partida_id,
    ponto_chegada_id,
    paragem_id,
    estado
  )
  VALUES (
    COALESCE(NULLIF(trim(_nome), ''), _nome_partida || ' → ' || _nome_chegada),
    _veiculo_id,
    _motorista_id,
    _hora_inicio,
    _hora_fim,
    _passageiros_previstos,
    _ponto_partida_id,
    _ponto_chegada_id,
    _paragem_id,
    'rascunho'
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
    _rota_id,
    _nome_chegada,
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

-- Força o PostgREST/Lovable Cloud a recarregar o contrato de funções e enums.
NOTIFY pgrst, 'reload schema';
