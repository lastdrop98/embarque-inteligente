-- Início operacional seguro de uma rota pelo motorista atribuído.
CREATE OR REPLACE FUNCTION public.iniciar_rota_segura(_rota_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _estado public.estado_rota;
  _motorista uuid;
  _partida timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT public.pode_gerir_rota(_rota_id) THEN
    RAISE EXCEPTION 'Sem permissão para iniciar esta rota';
  END IF;

  SELECT estado, motorista_id
    INTO _estado, _motorista
  FROM public.rotas
  WHERE id = _rota_id
  FOR UPDATE;

  IF _estado IS NULL THEN
    RAISE EXCEPTION 'Rota não encontrada';
  END IF;

  IF _motorista IS DISTINCT FROM auth.uid()
     AND NOT public.has_role(auth.uid(), 'admin')
     AND NOT public.has_role(auth.uid(), 'operador') THEN
    RAISE EXCEPTION 'Apenas o motorista atribuído pode iniciar esta rota';
  END IF;

  IF _estado <> 'embarque_fechado' THEN
    RAISE EXCEPTION 'A rota só pode iniciar depois de fechar o embarque';
  END IF;

  UPDATE public.rotas
  SET estado = 'em_curso'
  WHERE id = _rota_id;

  SELECT hora_partida_real INTO _partida
  FROM public.rotas
  WHERE id = _rota_id;

  RETURN jsonb_build_object(
    'rota_id', _rota_id,
    'estado', 'em_curso',
    'hora_partida_real', _partida
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.iniciar_rota_segura(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iniciar_rota_segura(uuid) TO authenticated;
