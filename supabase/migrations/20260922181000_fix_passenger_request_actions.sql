-- Corrige cancelamento/eliminação de pedidos para o próprio passageiro.
-- A identidade é validada por passageiro.user_id ou por criado_por.

CREATE OR REPLACE FUNCTION public.cancelar_pedido(_pedido_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _criado_por uuid;
  _passageiro_user_id uuid;
  _estado public.estado_pedido;
BEGIN
  SELECT p.criado_por, p.estado, pa.user_id
  INTO _criado_por, _estado, _passageiro_user_id
  FROM public.pedidos_transporte p
  LEFT JOIN public.passageiros pa ON pa.id = p.passageiro_id
  WHERE p.id = _pedido_id
  FOR UPDATE OF p;

  IF _estado IS NULL THEN
    RAISE EXCEPTION 'Pedido não encontrado';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'operador')
    OR _criado_por = auth.uid()
    OR _passageiro_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Sem permissão para cancelar este pedido';
  END IF;

  IF _estado IN ('cancelado','rejeitado') THEN
    RAISE EXCEPTION 'Este pedido já não está activo';
  END IF;

  UPDATE public.pedidos_transporte
  SET estado = 'cancelado'
  WHERE id = _pedido_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.eliminar_pedido(_pedido_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _criado_por uuid;
  _passageiro_user_id uuid;
  _estado public.estado_pedido;
BEGIN
  SELECT p.criado_por, p.estado, pa.user_id
  INTO _criado_por, _estado, _passageiro_user_id
  FROM public.pedidos_transporte p
  LEFT JOIN public.passageiros pa ON pa.id = p.passageiro_id
  WHERE p.id = _pedido_id
  FOR UPDATE OF p;

  IF _estado IS NULL THEN
    RAISE EXCEPTION 'Pedido não encontrado';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operador') THEN
    DELETE FROM public.pedidos_transporte WHERE id = _pedido_id;
    RETURN;
  END IF;

  IF (_criado_por = auth.uid() OR _passageiro_user_id = auth.uid())
     AND _estado IN ('rascunho','submetido','cancelado','rejeitado') THEN
    DELETE FROM public.pedidos_transporte WHERE id = _pedido_id;
    RETURN;
  END IF;

  RAISE EXCEPTION 'Este pedido já está em processamento e não pode ser eliminado pelo passageiro';
END;
$function$;

REVOKE ALL ON FUNCTION public.cancelar_pedido(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancelar_pedido(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.eliminar_pedido(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eliminar_pedido(uuid) TO authenticated;
