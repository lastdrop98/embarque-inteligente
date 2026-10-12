-- Avaliações de viagens concluídas: uma avaliação por passageiro e viagem.
CREATE TABLE IF NOT EXISTS public.avaliacoes_viagem (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viagem_id uuid NOT NULL REFERENCES public.viagens_passageiro(id) ON DELETE CASCADE,
  passageiro_id uuid NOT NULL REFERENCES public.passageiros(id) ON DELETE CASCADE,
  rota_id uuid NOT NULL REFERENCES public.rotas(id) ON DELETE CASCADE,
  estrelas smallint NOT NULL CHECK (estrelas BETWEEN 1 AND 5),
  comentario text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT avaliacoes_viagem_unica UNIQUE (viagem_id, passageiro_id),
  CONSTRAINT avaliacoes_comentario_tamanho CHECK (char_length(comentario) <= 2000)
);

CREATE INDEX IF NOT EXISTS idx_avaliacoes_rota_created
  ON public.avaliacoes_viagem (rota_id, created_at DESC);

ALTER TABLE public.avaliacoes_viagem ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.avaliacoes_viagem TO authenticated;
GRANT ALL ON public.avaliacoes_viagem TO service_role;

DROP POLICY IF EXISTS avaliacoes_select_autorizado ON public.avaliacoes_viagem;
CREATE POLICY avaliacoes_select_autorizado ON public.avaliacoes_viagem
FOR SELECT TO authenticated
USING (
  passageiro_id IN (SELECT p.id FROM public.passageiros p WHERE p.user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'operador')
);

DROP POLICY IF EXISTS avaliacoes_insert_viagem_concluida ON public.avaliacoes_viagem;
CREATE POLICY avaliacoes_insert_viagem_concluida ON public.avaliacoes_viagem
FOR INSERT TO authenticated
WITH CHECK (
  passageiro_id IN (SELECT p.id FROM public.passageiros p WHERE p.user_id = auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.viagens_passageiro v
    WHERE v.id = viagem_id
      AND v.passageiro_id = avaliacoes_viagem.passageiro_id
      AND v.rota_id = avaliacoes_viagem.rota_id
      AND v.estado = 'desembarcado'
  )
);

DROP POLICY IF EXISTS avaliacoes_update_propria ON public.avaliacoes_viagem;
CREATE POLICY avaliacoes_update_propria ON public.avaliacoes_viagem
FOR UPDATE TO authenticated
USING (passageiro_id IN (SELECT p.id FROM public.passageiros p WHERE p.user_id = auth.uid()))
WITH CHECK (
  passageiro_id IN (SELECT p.id FROM public.passageiros p WHERE p.user_id = auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.viagens_passageiro v
    WHERE v.id = viagem_id
      AND v.passageiro_id = avaliacoes_viagem.passageiro_id
      AND v.rota_id = avaliacoes_viagem.rota_id
      AND v.estado = 'desembarcado'
  )
);

DROP POLICY IF EXISTS avaliacoes_delete_admin ON public.avaliacoes_viagem;
CREATE POLICY avaliacoes_delete_admin ON public.avaliacoes_viagem
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_avaliacoes_viagem_updated_at ON public.avaliacoes_viagem;
CREATE TRIGGER trg_avaliacoes_viagem_updated_at
BEFORE UPDATE ON public.avaliacoes_viagem
FOR EACH ROW EXECUTE FUNCTION public.tocar_updated_at();

NOTIFY pgrst, 'reload schema';
