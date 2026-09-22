-- Pontos predefinidos pelo Administrador e criação de rotas controlada pelo Operador.
-- Preparação da plataforma para a nova apresentação.

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

ALTER TABLE public.rotas
  DROP CONSTRAINT IF EXISTS rotas_pontos_distintos_chk;

ALTER TABLE public.rotas
  ADD CONSTRAINT rotas_pontos_distintos_chk
  CHECK (
    ponto_partida_id IS NULL
    OR ponto_chegada_id IS NULL
    OR ponto_partida_id <> ponto_chegada_id
  );

ALTER TABLE public.rotas
  DROP CONSTRAINT IF EXISTS rotas_paragem_distinta_chk;

ALTER TABLE public.rotas
  ADD CONSTRAINT rotas_paragem_distinta_chk
  CHECK (
    paragem_id IS NULL
    OR (
      paragem_id <> ponto_partida_id
      AND paragem_id <> ponto_chegada_id
    )
  );

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

REVOKE ALL ON FUNCTION public.criar_rota_operacional(text, uuid, uuid, uuid, uuid, uuid, time, time, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_rota_operacional(text, uuid, uuid, uuid, uuid, uuid, time, time, integer) TO authenticated;

-- Garante que pedidos só usem pontos que o Administrador predefiniu.
CREATE OR REPLACE FUNCTION public.validar_pontos_pedido()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.pontos_predefinidos
    WHERE lower(trim(nome)) = lower(trim(NEW.origem))
      AND activo = true
  ) THEN
    RAISE EXCEPTION 'Ponto de origem inválido. Escolha um ponto predefinido pelo Administrador.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.pontos_predefinidos
    WHERE lower(trim(nome)) = lower(trim(NEW.destino))
      AND activo = true
  ) THEN
    RAISE EXCEPTION 'Destino inválido. Escolha um ponto predefinido pelo Administrador.';
  END IF;

  IF lower(trim(NEW.origem)) = lower(trim(NEW.destino)) THEN
    RAISE EXCEPTION 'A origem e o destino devem ser diferentes.';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validar_pontos_pedido ON public.pedidos_transporte;
CREATE TRIGGER trg_validar_pontos_pedido
BEFORE INSERT OR UPDATE OF origem, destino
ON public.pedidos_transporte
FOR EACH ROW
EXECUTE FUNCTION public.validar_pontos_pedido();

-- Limpeza completa dos dados operacionais para uma nova apresentação.
-- Contas autenticadas, perfis e papéis são preservados para não bloquear o acesso.
CREATE OR REPLACE FUNCTION public.limpar_dados_apresentacao()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas o Administrador pode limpar os dados da apresentação';
  END IF;

  DELETE FROM public.avaliacoes;
  DELETE FROM public.registos_embarque;
  DELETE FROM public.viagens_passageiro;
  DELETE FROM public.pedidos_transporte;
  DELETE FROM public.incidentes;
  DELETE FROM public.notificacoes;
  DELETE FROM public.registo_auditoria;
  DELETE FROM public.paragens;
  DELETE FROM public.rotas;
  DELETE FROM public.veiculos;
  DELETE FROM public.delegacoes;
  DELETE FROM public.pontos_predefinidos;

  RETURN jsonb_build_object(
    'ok', true,
    'mensagem', 'Dados operacionais, histórico e configurações de apresentação foram limpos.'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.limpar_dados_apresentacao() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.limpar_dados_apresentacao() TO authenticated;

-- Limpeza inicial, conforme solicitado, mantendo apenas contas/papéis.
DELETE FROM public.avaliacoes;
DELETE FROM public.registos_embarque;
DELETE FROM public.viagens_passageiro;
DELETE FROM public.pedidos_transporte;
DELETE FROM public.incidentes;
DELETE FROM public.notificacoes;
DELETE FROM public.registo_auditoria;
DELETE FROM public.paragens;
DELETE FROM public.rotas;
DELETE FROM public.veiculos;
DELETE FROM public.delegacoes;
DELETE FROM public.pontos_predefinidos;
