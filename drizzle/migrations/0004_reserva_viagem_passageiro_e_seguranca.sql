-- Data de serviço da rota (definida pelo operador)
ALTER TABLE public.rotas ADD COLUMN IF NOT EXISTS data_servico date;

-- Pontos de partida/destino disponíveis numa data (só nomes de paragens)
CREATE OR REPLACE FUNCTION public.pontos_disponiveis(_data date)
RETURNS TABLE(nome text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT DISTINCT p.nome
  FROM public.paragens p JOIN public.rotas r ON r.id = p.rota_id
  WHERE auth.uid() IS NOT NULL
    AND r.data_servico = _data
    AND r.estado IN ('agendada','embarque_aberto')
  ORDER BY p.nome;
$$;

-- Rotas compatíveis: mesma data, origem antes do destino, lugares livres, embarque ainda aberto
CREATE OR REPLACE FUNCTION public.rotas_disponiveis(_data date, _origem text, _destino text)
RETURNS TABLE(rota_id uuid, rota_nome text, paragem_embarque_id uuid, paragem_desembarque_id uuid,
              hora_partida time, hora_chegada time, veiculo text, lugares_livres integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT r.id, r.nome, pe.id, pd.id,
         COALESCE(pe.hora_prevista, r.hora_inicio), COALESCE(pd.hora_prevista, r.hora_fim),
         v.nome,
         (v.lugares - (SELECT count(*) FROM public.viagens_passageiro vp
                       WHERE vp.rota_id = r.id AND vp.estado NOT IN ('recusada','nao_compareceu')))::int
  FROM public.rotas r
  JOIN public.veiculos v ON v.id = r.veiculo_id
  JOIN public.paragens pe ON pe.rota_id = r.id AND pe.nome = _origem
  JOIN public.paragens pd ON pd.rota_id = r.id AND pd.nome = _destino AND pd.ordem > pe.ordem
  WHERE auth.uid() IS NOT NULL
    AND r.data_servico = _data
    AND r.estado IN ('agendada','embarque_aberto')
    AND COALESCE(pe.hora_prevista, r.hora_inicio) IS NOT NULL
    AND (_data + COALESCE(pe.hora_prevista, r.hora_inicio) - interval '10 minutes')
        > (now() AT TIME ZONE 'Africa/Maputo')
    AND v.lugares > (SELECT count(*) FROM public.viagens_passageiro vp
                     WHERE vp.rota_id = r.id AND vp.estado NOT IN ('recusada','nao_compareceu'))
  ORDER BY 5;
$$;

-- Reserva: valida tudo de novo no servidor e cria pedido + bilhete
CREATE OR REPLACE FUNCTION public.reservar_viagem(_rota_id uuid, _embarque_id uuid, _desembarque_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _pass record; _r record; _pe record; _pd record; _livres int; _viagem uuid; _pedido uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.conta_activa() THEN RAISE EXCEPTION 'Sessão inválida.'; END IF;
  SELECT id, categoria INTO _pass FROM public.passageiros WHERE user_id = auth.uid() LIMIT 1;
  IF _pass.id IS NULL THEN RAISE EXCEPTION 'Conta sem perfil de passageiro.'; END IF;

  SELECT r.*, v.lugares INTO _r FROM public.rotas r JOIN public.veiculos v ON v.id = r.veiculo_id
  WHERE r.id = _rota_id FOR UPDATE OF r;
  IF _r.id IS NULL OR _r.estado NOT IN ('agendada','embarque_aberto') OR _r.data_servico IS NULL THEN
    RAISE EXCEPTION 'Esta viagem já não está disponível.';
  END IF;
  SELECT * INTO _pe FROM public.paragens WHERE id = _embarque_id AND rota_id = _rota_id;
  SELECT * INTO _pd FROM public.paragens WHERE id = _desembarque_id AND rota_id = _rota_id;
  IF _pe.id IS NULL OR _pd.id IS NULL OR _pd.ordem <= _pe.ordem THEN
    RAISE EXCEPTION 'Paragens incompatíveis com esta rota.';
  END IF;
  IF (_r.data_servico + COALESCE(_pe.hora_prevista, _r.hora_inicio) - interval '10 minutes')
     <= (now() AT TIME ZONE 'Africa/Maputo') THEN
    RAISE EXCEPTION 'O embarque desta viagem já fechou (10 minutos antes da partida).';
  END IF;
  IF EXISTS (SELECT 1 FROM public.viagens_passageiro WHERE rota_id = _rota_id AND passageiro_id = _pass.id
             AND estado NOT IN ('recusada','nao_compareceu')) THEN
    RAISE EXCEPTION 'Já tem um bilhete para esta viagem.';
  END IF;
  SELECT count(*) INTO _livres FROM public.viagens_passageiro
  WHERE rota_id = _rota_id AND estado NOT IN ('recusada','nao_compareceu');
  IF _livres >= _r.lugares THEN RAISE EXCEPTION 'Não há lugares livres nesta viagem.'; END IF;

  INSERT INTO public.pedidos_transporte (titulo, origem, destino, data_viagem, hora, num_passageiros,
    categoria, passageiro_id, estado, criado_por, rota_id)
  VALUES ('Reserva — '||_r.nome, _pe.nome, _pd.nome, _r.data_servico, COALESCE(_pe.hora_prevista,_r.hora_inicio), 1,
    _pass.categoria, _pass.id, 'agendado', auth.uid(), _rota_id)
  RETURNING id INTO _pedido;

  INSERT INTO public.viagens_passageiro (rota_id, passageiro_id, paragem_embarque_id, paragem_desembarque_id, estado)
  VALUES (_rota_id, _pass.id, _embarque_id, _desembarque_id, 'pendente')
  RETURNING id INTO _viagem;
  RETURN _viagem;
END;
$$;

REVOKE ALL ON FUNCTION public.pontos_disponiveis(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rotas_disponiveis(date, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reservar_viagem(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pontos_disponiveis(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rotas_disponiveis(date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_viagem(uuid, uuid, uuid) TO authenticated;

-- Segurança: viaturas só visíveis a quem precisa
DROP POLICY IF EXISTS veiculos_select_auth ON public.veiculos;
CREATE POLICY veiculos_select ON public.veiculos FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operador')
  OR EXISTS (SELECT 1 FROM public.rotas r WHERE r.veiculo_id = veiculos.id AND r.motorista_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.rotas r
             JOIN public.viagens_passageiro vp ON vp.rota_id = r.id
             JOIN public.passageiros p ON p.id = vp.passageiro_id
             WHERE r.veiculo_id = veiculos.id AND p.user_id = auth.uid())
);

-- Segurança: delegações só para gestão e para o próprio passageiro
DROP POLICY IF EXISTS "Delegações visíveis a utilizadores autenticados" ON public.delegacoes;
DROP POLICY IF EXISTS delegacoes_select ON public.delegacoes;
CREATE POLICY delegacoes_select ON public.delegacoes FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operador')
  OR EXISTS (SELECT 1 FROM public.passageiros p WHERE p.delegacao_id = delegacoes.id AND p.user_id = auth.uid())
);