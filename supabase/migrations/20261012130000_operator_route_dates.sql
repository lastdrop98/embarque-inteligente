ALTER TABLE public.rotas ADD COLUMN IF NOT EXISTS data_viagem date;
CREATE INDEX IF NOT EXISTS idx_rotas_data_estado ON public.rotas(data_viagem, estado);
DROP POLICY IF EXISTS rotas_select_passageiro_agendadas ON public.rotas;
CREATE POLICY rotas_select_passageiro_agendadas ON public.rotas
FOR SELECT TO authenticated
USING (
  public.conta_activa()
  AND estado = 'agendada'
  AND data_viagem >= (now() AT TIME ZONE 'Africa/Maputo')::date
);
DROP POLICY IF EXISTS paragens_select_passageiro_agendadas ON public.paragens;
CREATE POLICY paragens_select_passageiro_agendadas ON public.paragens
FOR SELECT TO authenticated
USING (
  public.conta_activa()
  AND EXISTS (
    SELECT 1 FROM public.rotas r
    WHERE r.id = paragens.rota_id
      AND r.estado = 'agendada'
      AND r.data_viagem >= (now() AT TIME ZONE 'Africa/Maputo')::date
  )
);
NOTIFY pgrst, 'reload schema';
