-- Garantir no máximo um pedido de transporte activo por passageiro.
-- Estados activos: ainda aguardam conclusão, rejeição ou cancelamento.
create unique index if not exists uq_pedidos_passageiro_um_activo
on public.pedidos_transporte (passageiro_id)
where passageiro_id is not null
  and estado in (
    'rascunho',
    'submetido',
    'em_analise',
    'aprovado',
    'alocado',
    'agendado'
  );
