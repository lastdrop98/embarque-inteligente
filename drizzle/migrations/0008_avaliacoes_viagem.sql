-- PickApp Mobility: reforça a segurança da tabela de avaliações já existente.
-- A aplicação usa public.avaliacoes (nota, comentario, viagem_id); não criar uma tabela paralela.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'avaliacoes_nota_intervalo'
      AND conrelid = 'public.avaliacoes'::regclass
  ) THEN
    ALTER TABLE public.avaliacoes
      ADD CONSTRAINT avaliacoes_nota_intervalo CHECK (nota BETWEEN 1 AND 5);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'avaliacoes_comentario_tamanho'
      AND conrelid = 'public.avaliacoes'::regclass
  ) THEN
    ALTER TABLE public.avaliacoes
      ADD CONSTRAINT avaliacoes_comentario_tamanho
      CHECK (comentario IS NULL OR char_length(comentario) <= 2000);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_avaliacoes_viagem_id
  ON public.avaliacoes (viagem_id);

ALTER TABLE public.avaliacoes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.avaliacoes TO authenticated;
GRANT ALL ON public.avaliacoes TO service_role;

DROP POLICY IF EXISTS avaliacoes_select_autorizado ON public.avaliacoes;
CREATE POLICY avaliacoes_select_autorizado ON public.avaliacoes
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.viagens_passageiro v
    JOIN public.passageiros p ON p.id = v.passageiro_id
    WHERE v.id = avaliacoes.viagem_id
      AND p.user_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'operador')
);

DROP POLICY IF EXISTS avaliacoes_insert_viagem_concluida ON public.avaliacoes;
CREATE POLICY avaliacoes_insert_viagem_concluida ON public.avaliacoes
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.viagens_passageiro v
    JOIN public.passageiros p ON p.id = v.passageiro_id
    WHERE v.id = avaliacoes.viagem_id
      AND p.user_id = auth.uid()
      AND v.estado = 'concluida'
  )
);

-- A avaliação é submetida pelo passageiro após a viagem; edição não é permitida via API.
DROP POLICY IF EXISTS avaliacoes_update_propria ON public.avaliacoes;
DROP POLICY IF EXISTS avaliacoes_update ON public.avaliacoes;
DROP POLICY IF EXISTS avaliacoes_delete ON public.avaliacoes;

NOTIFY pgrst, 'reload schema';
