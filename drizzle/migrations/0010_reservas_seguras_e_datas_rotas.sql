-- 1) Data da viagem nas rotas: a aplicação usa data_viagem; funções antigas usam data_servico.
ALTER TABLE public.rotas ADD COLUMN IF NOT EXISTS data_viagem date;
UPDATE public.rotas SET data_viagem = data_servico WHERE data_viagem IS NULL AND data_servico IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rotas_data_estado ON public.rotas(data_viagem, estado);

CREATE OR REPLACE FUNCTION public.sincronizar_data_rota()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.data_viagem := COALESCE(NEW.data_viagem, NEW.data_servico);
  ELSIF NEW.data_viagem IS DISTINCT FROM OLD.data_viagem THEN
    NULL;
  ELSIF NEW.data_servico IS DISTINCT FROM OLD.data_servico THEN
    NEW.data_viagem := NEW.data_servico;
  END IF;
  NEW.data_servico := NEW.data_viagem;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_sincronizar_data_rota ON public.rotas;
CREATE TRIGGER trg_sincronizar_data_rota BEFORE INSERT OR UPDATE ON public.rotas
FOR EACH ROW EXECUTE FUNCTION public.sincronizar_data_rota();

-- 2) Uma única viagem activa por passageiro (garantia na base de dados).
CREATE UNIQUE INDEX IF NOT EXISTS ux_viagem_activa_por_passageiro
  ON public.viagens_passageiro (passageiro_id)
  WHERE estado IN ('pendente','a_bordo','desembarcado');

-- 3) Viagens disponíveis para o passageiro (só agendadas, futuras, com lugares).
CREATE OR REPLACE FUNCTION public.viagens_disponiveis_passageiro(_data date, _origem text, _destino text)
RETURNS TABLE(
  rota_id uuid, rota_nome text, data_viagem date,
  paragem_embarque_id uuid, paragem_embarque text, hora_embarque time,
  paragem_desembarque_id uuid, paragem_desembarque text, hora_chegada time,
  veiculo text, matricula text, lugares integer, lugares_livres integer, embarque_fecha_em timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH base AS (
    SELECT r.id, r.nome, r.data_viagem, v.nome AS vnome, v.matricula, v.lugares,
           pe.id AS pe_id, pe.nome AS pe_nome, COALESCE(pe.hora_prevista, r.hora_inicio) AS h_emb,
           pd.id AS pd_id, pd.nome AS pd_nome, COALESCE(pd.hora_prevista, r.hora_fim) AS h_che,
           (SELECT count(*) FROM public.viagens_passageiro vp
             WHERE vp.rota_id = r.id AND vp.estado IN ('pendente','a_bordo','desembarcado','concluida'))::int AS ocupados
    FROM public.rotas r
    JOIN public.veiculos v ON v.id = r.veiculo_id
    JOIN public.paragens pe ON pe.rota_id = r.id AND lower(trim(pe.nome)) = lower(trim(_origem))
    JOIN public.paragens pd ON pd.rota_id = r.id AND lower(trim(pd.nome)) = lower(trim(_destino)) AND pd.ordem > pe.ordem
    WHERE auth.uid() IS NOT NULL AND public.conta_activa()
      AND r.data_viagem = _data
      AND r.estado IN ('agendada','embarque_aberto')
  )
  SELECT id, nome, data_viagem, pe_id, pe_nome, h_emb, pd_id, pd_nome, h_che,
         vnome, matricula, lugares, (lugares - ocupados),
         ((data_viagem + h_emb) AT TIME ZONE 'Africa/Maputo') - interval '10 minutes'
  FROM base
  WHERE h_emb IS NOT NULL
    AND lugares > ocupados
    AND now() < ((data_viagem + h_emb) AT TIME ZONE 'Africa/Maputo') - interval '10 minutes'
  ORDER BY h_emb;
$$;
REVOKE ALL ON FUNCTION public.viagens_disponiveis_passageiro(date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.viagens_disponiveis_passageiro(date, text, text) TO authenticated;

-- 4) Reserva segura e concorrente.
CREATE OR REPLACE FUNCTION public.reservar_viagem_passageiro(
  _rota_id uuid, _paragem_embarque_id uuid, _paragem_desembarque_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _pass record; _r record; _pe record; _pd record;
  _hora time; _ocupados int; _viagem uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Inicie sessão para reservar uma viagem.'; END IF;
  IF NOT public.conta_activa() OR NOT public.has_role(_uid, 'passageiro') THEN
    RAISE EXCEPTION 'Apenas uma conta de passageiro activa pode reservar viagens.';
  END IF;
  SELECT id, categoria INTO _pass FROM public.passageiros WHERE user_id = _uid LIMIT 1;
  IF _pass.id IS NULL THEN RAISE EXCEPTION 'A sua conta não tem perfil de passageiro.'; END IF;

  -- Serializa reservas do mesmo passageiro e da mesma rota.
  PERFORM pg_advisory_xact_lock(hashtextextended(_pass.id::text, 0));
  SELECT r.*, v.lugares, v.nome AS vnome INTO _r
    FROM public.rotas r JOIN public.veiculos v ON v.id = r.veiculo_id
    WHERE r.id = _rota_id FOR UPDATE OF r;
  IF _r.id IS NULL THEN RAISE EXCEPTION 'Esta viagem não existe ou não tem autocarro atribuído.'; END IF;
  IF _r.estado NOT IN ('agendada','embarque_aberto') OR _r.data_viagem IS NULL
     OR _r.data_viagem < (now() AT TIME ZONE 'Africa/Maputo')::date THEN
    RAISE EXCEPTION 'Esta viagem já não está disponível para reserva.';
  END IF;

  SELECT * INTO _pe FROM public.paragens WHERE id = _paragem_embarque_id AND rota_id = _rota_id;
  SELECT * INTO _pd FROM public.paragens WHERE id = _paragem_desembarque_id AND rota_id = _rota_id;
  IF _pe.id IS NULL OR _pd.id IS NULL THEN RAISE EXCEPTION 'A partida ou o destino não pertencem a esta rota.'; END IF;
  IF _pd.ordem <= _pe.ordem THEN RAISE EXCEPTION 'O ponto de partida tem de vir antes do destino nesta rota.'; END IF;

  _hora := COALESCE(_pe.hora_prevista, _r.hora_inicio);
  IF _hora IS NULL THEN RAISE EXCEPTION 'O operador ainda não definiu o horário desta paragem.'; END IF;
  IF now() >= ((_r.data_viagem + _hora) AT TIME ZONE 'Africa/Maputo') - interval '10 minutes' THEN
    RAISE EXCEPTION 'O embarque desta viagem já fechou (10 minutos antes da partida).';
  END IF;

  IF EXISTS (SELECT 1 FROM public.viagens_passageiro
             WHERE passageiro_id = _pass.id AND estado IN ('pendente','a_bordo','desembarcado')) THEN
    RAISE EXCEPTION 'Já tem uma viagem activa. Conclua ou cancele a viagem actual antes de reservar outra.';
  END IF;

  SELECT count(*) INTO _ocupados FROM public.viagens_passageiro
   WHERE rota_id = _rota_id AND estado IN ('pendente','a_bordo','desembarcado','concluida');
  IF _ocupados >= _r.lugares THEN RAISE EXCEPTION 'Esta viagem já não tem lugares disponíveis.'; END IF;

  INSERT INTO public.viagens_passageiro (rota_id, passageiro_id, paragem_embarque_id, paragem_desembarque_id, estado)
  VALUES (_rota_id, _pass.id, _pe.id, _pd.id, 'pendente')
  RETURNING id INTO _viagem;

  -- Histórico do passageiro (pedido já agendado, ligado à rota).
  INSERT INTO public.pedidos_transporte (titulo, origem, destino, data_viagem, hora, num_passageiros,
    categoria, passageiro_id, estado, criado_por, rota_id)
  VALUES ('Reserva — '||_r.nome, _pe.nome, _pd.nome, _r.data_viagem, _hora, 1,
    _pass.categoria, _pass.id, 'agendado', _uid, _rota_id);

  RETURN _viagem;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Já tem uma viagem activa. Conclua ou cancele a viagem actual antes de reservar outra.';
END $$;
REVOKE ALL ON FUNCTION public.reservar_viagem_passageiro(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reservar_viagem_passageiro(uuid, uuid, uuid) TO authenticated;

-- 5) Operador também gere pontos predefinidos.
DROP POLICY IF EXISTS pontos_operador_insert ON public.pontos_predefinidos;
CREATE POLICY pontos_operador_insert ON public.pontos_predefinidos FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'operador'));
DROP POLICY IF EXISTS pontos_operador_update ON public.pontos_predefinidos;
CREATE POLICY pontos_operador_update ON public.pontos_predefinidos FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'operador')) WITH CHECK (public.has_role(auth.uid(), 'operador'));

-- 6) Avaliações: média agregada sem expor comentários de outros passageiros.
CREATE OR REPLACE FUNCTION public.media_avaliacoes()
RETURNS TABLE(media numeric, total integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT round(avg(nota)::numeric, 2), count(*)::int FROM public.avaliacoes WHERE auth.uid() IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.media_avaliacoes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.media_avaliacoes() TO authenticated;

NOTIFY pgrst, 'reload schema';