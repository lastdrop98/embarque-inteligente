-- Embarque Inteligente — correção do estado dos pedidos
-- O enum precisa receber 'cancelado' antes de as funções que usam esse valor serem criadas.
ALTER TYPE public.estado_pedido ADD VALUE IF NOT EXISTS 'cancelado';