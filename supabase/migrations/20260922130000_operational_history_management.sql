-- Gestão segura de histórico operacional: eliminação de rotas e pedidos.
-- Apenas admin/operador podem apagar dados operacionais globais.
-- O passageiro pode apagar os próprios pedidos ainda não processados.

ALTER TYPE public.estado_pedido ADD VALUE IF NOT EXISTS 'cancelado';

CREATE OR REPLACE FUNCTION public.eliminar_rota_segura(_rota_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _estado public.estado_rota;
BEGIN
  IF auth.uid() IS NULL OR (
    NOT public.has_role(auth.uid(), 'admin')
    AND NOT public.has_role(auth.uid(), 'operador')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para eliminar a rota';
  END IF;

  SELECT estado INTO _estado
  FROM public.rotas
  WHERE id = _rota_id
  FOR UPDATE;

  IF _estado IS NULL THEN
    RAISE EXCEPTION 'Rota não encontrada';
  END IF;

  IF _estado NOT IN ('rascunho','cancelada','concluida') THEN
    RAISE EXCEPTION 'Apenas rotas em rascunho, canceladas ou concluídas podem ser eliminadas';
  END IF;

  -- As FKs da base eliminam em cascata paragens, viagens e registos de embarque.
  DELETE FROM public.rotas WHERE id = _rota_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.eliminar_rota_segura(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eliminar_rota_segura(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancelar_pedido(_pedido_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _criado_por uuid;
  _estado public.estado_pedido;
BEGIN
  SELECT criado_por, estado INTO _criado_por, _estado
  FROM public.pedidos_transporte
  WHERE id = _pedido_id
  FOR UPDATE;

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
  ) THEN
    RAISE EXCEPTION 'Sem permissão para cancelar este pedido';
  END IF;

  IF _estado IN ('agendado','alocado') AND NOT (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'operador')
  ) THEN
    RAISE EXCEPTION 'O passageiro não pode cancelar um pedido já alocado/agendado';
  END IF;

  EXECUTE 'UPDATE public.pedidos_transporte SET estado = $1::public.estado_pedido WHERE id = $2'
    USING 'cancelado', _pedido_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.cancelar_pedido(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancelar_pedido(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.eliminar_pedido(_pedido_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _criado_por uuid;
  _estado public.estado_pedido;
BEGIN
  SELECT criado_por, estado INTO _criado_por, _estado
  FROM public.pedidos_transporte
  WHERE id = _pedido_id
  FOR UPDATE;

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

  IF _criado_por = auth.uid() AND _estado IN ('rascunho','submetido','cancelado','rejeitado') THEN
    DELETE FROM public.pedidos_transporte WHERE id = _pedido_id;
    RETURN;
  END IF;

  RAISE EXCEPTION 'Este pedido já está em processamento e não pode ser eliminado pelo passageiro';
END;
$function$;

REVOKE ALL ON FUNCTION public.eliminar_pedido(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eliminar_pedido(uuid) TO authenticated;
