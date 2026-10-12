ALTER TABLE public.rotas ADD COLUMN IF NOT EXISTS data_viagem date;
CREATE INDEX IF NOT EXISTS idx_rotas_data_estado ON public.rotas(data_viagem, estado);
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
AS $
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

  SELECT r.id, r.estado, r.data_viagem, r.hora_inicio, r.hora_fim, r.veiculo_id, v.lugares AS capacidade
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
  RETURN _viagem_id;
END;
$;
REVOKE ALL ON FUNCTION public.reservar_viagem_passageiro(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reservar_viagem_passageiro(uuid, uuid, uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
