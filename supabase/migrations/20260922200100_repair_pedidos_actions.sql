-- Repair RPCs for passenger/operator/admin request actions.
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

  IF _estado IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  IF NOT (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'operador')
    OR _criado_por = auth.uid()
    OR _passageiro_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Sem permissão para cancelar este pedido';
  END IF;

  IF _estado IN ('cancelado','rejeitado') THEN
    RAISE EXCEPTION 'Este pedido já não está activo';
  END IF;

  UPDATE public.pedidos_transporte
     SET estado = 'cancelado'::public.estado_pedido
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

  IF _estado IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  IF public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operador') THEN
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
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

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

CREATE OR REPLACE FUNCTION public.limpar_dados_apresentacao()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Apenas o Administrador pode limpar os dados da apresentação';
  END IF;

  DELETE FROM public.avaliacoes WHERE TRUE;
  DELETE FROM public.registos_embarque WHERE TRUE;
  DELETE FROM public.viagens_passageiro WHERE TRUE;
  DELETE FROM public.incidentes WHERE TRUE;
  DELETE FROM public.notificacoes WHERE TRUE;
  DELETE FROM public.registo_auditoria WHERE TRUE;
  DELETE FROM public.paragens WHERE TRUE;
  DELETE FROM public.rotas WHERE TRUE;
  DELETE FROM public.pedidos_transporte WHERE TRUE;
  DELETE FROM public.veiculos WHERE TRUE;
  DELETE FROM public.delegacoes WHERE TRUE;
  DELETE FROM public.pontos_predefinidos WHERE TRUE;

  -- Preserve passengers, profiles, roles and authentication accounts.
  RETURN jsonb_build_object(
    'ok', true,
    'mensagem', 'Dados operacionais, histórico e configurações de apresentação foram limpos. Passageiros, perfis e papéis foram preservados.'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.cancelar_pedido(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancelar_pedido(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.eliminar_pedido(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eliminar_pedido(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.eliminar_meus_pedidos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eliminar_meus_pedidos() TO authenticated;
REVOKE ALL ON FUNCTION public.limpar_dados_apresentacao() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.limpar_dados_apresentacao() TO authenticated;
