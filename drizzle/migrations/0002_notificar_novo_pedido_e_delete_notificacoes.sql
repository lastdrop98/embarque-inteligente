-- Função para notificar admins/operadores de um novo pedido de transporte
CREATE OR REPLACE FUNCTION public.notificar_novo_pedido(_pedido_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _origem text;
  _destino text;
  _nome text;
  _msg text;
  _total integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT p.origem,
         p.destino,
         COALESCE(NULLIF(trim(pa.nome), ''), 'Passageiro')
    INTO _origem, _destino, _nome
  FROM public.pedidos_transporte p
  LEFT JOIN public.passageiros pa ON pa.id = p.passageiro_id
  WHERE p.id = _pedido_id;

  IF _origem IS NULL THEN
    RAISE EXCEPTION 'Pedido não encontrado';
  END IF;

  _msg := 'Novo pedido de transporte: ' || _nome || ' — ' || _origem || ' → ' || _destino || '.';

  INSERT INTO public.notificacoes (user_id, tipo, mensagem)
  SELECT DISTINCT pu.user_id, 'novo_pedido', _msg
  FROM public.papeis_utilizador pu
  WHERE pu.role IN ('admin', 'operador')
    AND NOT EXISTS (
      SELECT 1 FROM public.notificacoes n
      WHERE n.user_id = pu.user_id
        AND n.tipo = 'novo_pedido'
        AND n.mensagem = _msg
        AND n.created_at > now() - interval '10 minutes'
    );

  GET DIAGNOSTICS _total = ROW_COUNT;
  RETURN _total;
END;
$$;

REVOKE ALL ON FUNCTION public.notificar_novo_pedido(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notificar_novo_pedido(uuid) TO authenticated;

-- Permitir que cada utilizador apague as suas próprias notificações
DROP POLICY IF EXISTS notificacoes_delete_propria ON public.notificacoes;
CREATE POLICY notificacoes_delete_propria
ON public.notificacoes
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

GRANT DELETE ON public.notificacoes TO authenticated;