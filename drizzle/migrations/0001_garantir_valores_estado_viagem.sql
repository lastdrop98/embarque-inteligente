-- Garante que o enum public.estado_viagem possui todos os valores necessários.
-- Idempotente: ADD VALUE IF NOT EXISTS não altera nem remove valores existentes.
-- Fluxo QR existente preservado: pendente → a_bordo (embarque), a_bordo → desembarcado (desembarque).

ALTER TYPE public.estado_viagem ADD VALUE IF NOT EXISTS 'pendente';

ALTER TYPE public.estado_viagem ADD VALUE IF NOT EXISTS 'a_bordo';

ALTER TYPE public.estado_viagem ADD VALUE IF NOT EXISTS 'desembarcado';

ALTER TYPE public.estado_viagem ADD VALUE IF NOT EXISTS 'concluida';

ALTER TYPE public.estado_viagem ADD VALUE IF NOT EXISTS 'recusada';

ALTER TYPE public.estado_viagem ADD VALUE IF NOT EXISTS 'nao_compareceu';
