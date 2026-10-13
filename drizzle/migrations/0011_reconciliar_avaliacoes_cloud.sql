-- Corrige divergência de segurança em bases onde 0009 não foi aplicada.
-- Não altera avaliações existentes; a verificação prévia confirmou que não há comentários > 2000 caracteres.
DO $$
BEGIN
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

-- Normaliza nomes e regras RLS para que a base corresponda ao modelo actual.
DROP POLICY IF EXISTS avaliacoes_insert_passageiro ON public.avaliacoes;
DROP POLICY IF EXISTS avaliacoes_select ON public.avaliacoes;
DROP POLICY IF EXISTS avaliacoes_insert_viagem_concluida ON public.avaliacoes;
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

CREATE POLICY avaliacoes_insert_viagem_concluida ON public.avaliacoes
FOR INSERT TO authenticated
WITH CHECK (
  public.conta_activa()
  AND EXISTS (
    SELECT 1
    FROM public.viagens_passageiro v
    JOIN public.passageiros p ON p.id = v.passageiro_id
    WHERE v.id = avaliacoes.viagem_id
      AND p.user_id = auth.uid()
      AND v.estado = 'concluida'
  )
);

NOTIFY pgrst, 'reload schema';
