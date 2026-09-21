-- Fecho operacional seguro de uma rota.
-- Faz a reconciliação dos passageiros e a conclusão da rota na mesma transacção.

CREATE OR REPLACE FUNCTION public.concluir_rota_segura(_rota_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _estado public.estado_rota;
  _pendentes integer;
  _a_bordo integer;
  _desembarcados integer;
  _concluidos integer;
  _nao_compareceu integer;
  _recusados integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.pode_gerir_rota(_rota_id) THEN
    RAISE EXCEPTION 'Sem permissão para concluir esta rota';
  END IF;

  SELECT estado
    INTO _estado
  FROM public.rotas
  WHERE id = _rota_id
  FOR UPDATE;

  IF _estado IS NULL THEN
    RAISE EXCEPTION 'Rota não encontrada';
  END IF;

  IF _estado <> 'em_curso' THEN
    RAISE EXCEPTION 'A rota só pode ser concluída quando está em curso';
  END IF;

  SELECT
    count(*) FILTER (WHERE estado = 'pendente'),
    count(*) FILTER (WHERE estado = 'a_bordo'),
    count(*) FILTER (WHERE estado = 'desembarcado'),
    count(*) FILTER (WHERE estado = 'concluida'),
    count(*) FILTER (WHERE estado = 'nao_compareceu'),
    count(*) FILTER (WHERE estado = 'recusada')
  INTO
    _pendentes,
    _a_bordo,
    _desembarcados,
    _concluidos,
    _nao_compareceu,
    _recusados
  FROM public.viagens_passageiro
  WHERE rota_id = _rota_id;

  IF _pendentes > 0 THEN
    RAISE EXCEPTION 'Não é possível concluir: existem % passageiro(s) pendente(s)', _pendentes;
  END IF;

  IF _a_bordo > 0 THEN
    RAISE EXCEPTION 'Não é possível concluir: existem % passageiro(s) ainda a bordo', _a_bordo;
  END IF;

  UPDATE public.viagens_passageiro
  SET estado = 'concluida'
  WHERE rota_id = _rota_id
    AND estado = 'desembarcado';

  UPDATE public.rotas
  SET estado = 'concluida'
  WHERE id = _rota_id;

  RETURN jsonb_build_object(
    'rota_id', _rota_id,
    'estado', 'concluida',
    'desembarcados_finalizados', _desembarcados,
    'ja_concluidos', _concluidos,
    'nao_compareceu', _nao_compareceu,
    'recusados', _recusados
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.concluir_rota_segura(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.concluir_rota_segura(uuid) TO authenticated;

-- Impede que uma conclusão contorne a reconciliação através de UPDATE directo.
CREATE OR REPLACE FUNCTION public.validar_estado_rota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _pendentes integer;
  _a_bordo integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.estado IS NOT DISTINCT FROM OLD.estado THEN
    RETURN NEW;
  END IF;

  IF OLD.estado = 'rascunho' THEN
    IF NEW.estado NOT IN ('agendada','cancelada') THEN
      RAISE EXCEPTION 'Transição inválida da rota: rascunho -> %', NEW.estado;
    END IF;

  ELSIF OLD.estado = 'agendada' THEN
    IF NEW.estado NOT IN ('embarque_aberto','cancelada') THEN
      RAISE EXCEPTION 'Transição inválida da rota: agendada -> %', NEW.estado;
    END IF;

  ELSIF OLD.estado = 'embarque_aberto' THEN
    IF NEW.estado NOT IN ('embarque_fechado','cancelada') THEN
      RAISE EXCEPTION 'Transição inválida da rota: embarque_aberto -> %', NEW.estado;
    END IF;

  ELSIF OLD.estado = 'embarque_fechado' THEN
    IF NEW.estado <> 'em_curso' THEN
      RAISE EXCEPTION 'Transição inválida da rota: embarque_fechado -> %', NEW.estado;
    END IF;

    IF NEW.hora_partida_real IS NULL THEN
      NEW.hora_partida_real := now();
    END IF;

  ELSIF OLD.estado = 'em_curso' THEN
    IF NEW.estado <> 'concluida' THEN
      RAISE EXCEPTION 'Transição inválida da rota: em_curso -> %', NEW.estado;
    END IF;

    SELECT
      count(*) FILTER (WHERE estado = 'pendente'),
      count(*) FILTER (WHERE estado = 'a_bordo')
    INTO _pendentes, _a_bordo
    FROM public.viagens_passageiro
    WHERE rota_id = OLD.id;

    IF _pendentes > 0 THEN
      RAISE EXCEPTION 'Não é possível concluir: existem % passageiro(s) pendente(s)', _pendentes;
    END IF;

    IF _a_bordo > 0 THEN
      RAISE EXCEPTION 'Não é possível concluir: existem % passageiro(s) ainda a bordo', _a_bordo;
    END IF;

    IF NEW.hora_partida_real IS NULL THEN
      RAISE EXCEPTION 'Não é possível concluir a rota sem hora de partida real';
    END IF;

    IF NEW.hora_chegada_real IS NULL THEN
      NEW.hora_chegada_real := now();
    END IF;

  ELSIF OLD.estado IN ('concluida','cancelada') THEN
    RAISE EXCEPTION 'A rota já está num estado final (%) e não pode ser alterada', OLD.estado;

  ELSE
    RAISE EXCEPTION 'Estado anterior desconhecido da rota: %', OLD.estado;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validar_estado_rota ON public.rotas;

CREATE TRIGGER trg_validar_estado_rota
BEFORE UPDATE OF estado ON public.rotas
FOR EACH ROW
EXECUTE FUNCTION public.validar_estado_rota();
