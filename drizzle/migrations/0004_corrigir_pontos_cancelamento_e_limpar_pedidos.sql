-- Embarque Inteligente — pontos predefinidos, cancelamento e limpeza inicial de pedidos
-- Esta migration é idempotente onde possível e não apaga contas/perfis.

CREATE TABLE IF NOT EXISTS public.pontos_predefinidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pontos_predefinidos_nome_lower
  ON public.pontos_predefinidos (lower(trim(nome)));

ALTER TABLE public.pontos_predefinidos ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.pontos_predefinidos TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pontos_predefinidos TO authenticated;

DROP POLICY IF EXISTS pontos_select_authenticated ON public.pontos_predefinidos;
CREATE POLICY pontos_select_authenticated
ON public.pontos_predefinidos FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS pontos_admin_insert ON public.pontos_predefinidos;
CREATE POLICY pontos_admin_insert
ON public.pontos_predefinidos FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS pontos_admin_update ON public.pontos_predefinidos;
CREATE POLICY pontos_admin_update
ON public.pontos_predefinidos FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin'))
WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS pontos_admin_delete ON public.pontos_predefinidos;
CREATE POLICY pontos_admin_delete
ON public.pontos_predefinidos FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.cancelar_pedido(_pedido_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _criado_por uuid;
  _passageiro_user_id uuid;
  _estado text;
BEGIN
  SELECT p.criado_por, p.estado::text, pa.user_id
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
  _estado text;
BEGIN
  SELECT p.criado_por, p.estado::text, pa.user_id
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

CREATE OR REPLACE FUNCTION public.eliminar_meus_pedidos()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _total integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT count(*) INTO _total
  FROM public.pedidos_transporte p
  LEFT JOIN public.passageiros pa ON pa.id = p.passageiro_id
  WHERE (p.criado_por = auth.uid() OR pa.user_id = auth.uid())
    AND p.estado::text IN ('rascunho','submetido','cancelado','rejeitado');

  DELETE FROM public.pedidos_transporte p
  WHERE (p.criado_por = auth.uid()
         OR EXISTS (
           SELECT 1 FROM public.passageiros pa
           WHERE pa.id = p.passageiro_id AND pa.user_id = auth.uid()
         ))
    AND p.estado::text IN ('rascunho','submetido','cancelado','rejeitado');

  RETURN COALESCE(_total,0);
END;
$function$;

REVOKE ALL ON FUNCTION public.cancelar_pedido(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancelar_pedido(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.eliminar_pedido(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eliminar_pedido(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.eliminar_meus_pedidos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eliminar_meus_pedidos() TO authenticated;

