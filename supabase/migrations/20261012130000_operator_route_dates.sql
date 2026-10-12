ALTER TABLE public.rotas ADD COLUMN IF NOT EXISTS data_viagem date;
CREATE INDEX IF NOT EXISTS idx_rotas_data_estado ON public.rotas(data_viagem, estado);
NOTIFY pgrst, 'reload schema';
