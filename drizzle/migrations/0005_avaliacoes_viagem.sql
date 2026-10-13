-- Avaliações seguras: uma avaliação por viagem concluída, apenas pelo passageiro inscrito.
CREATE TABLE IF NOT EXISTS public.avaliacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viagem_id uuid NOT NULL UNIQUE REFERENCES public.viagens_passageiro(id) ON DELETE CASCADE,
  nota integer NOT NULL CHECK (nota BETWEEN 1 AND 5),
  comentario text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.avaliacoes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.avaliacoes TO authenticated;
REVOKE ALL ON public.avaliacoes FROM anon;

DROP POLICY IF EXISTS avaliacoes_select_propria ON public.avaliacoes;
CREATE POLICY avaliacoes_select_propria ON public.avaliacoes
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'operador')
  OR EXISTS (
    SELECT 1
    FROM public.viagens_passageiro vp
    JOIN public.passageiros p ON p.id = vp.passageiro_id
    WHERE vp.id = avaliacoes.viagem_id
      AND p.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS avaliacoes_insert_viagem_concluida ON public.avaliacoes;
CREATE POLICY avaliacoes_insert_viagem_concluida ON public.avaliacoes
FOR INSERT TO authenticated
WITH CHECK (
  nota BETWEEN 1 AND 5
  AND EXISTS (
    SELECT 1
    FROM public.viagens_passageiro vp
    JOIN public.passageiros p ON p.id = vp.passageiro_id
    WHERE vp.id = avaliacoes.viagem_id
      AND p.user_id = auth.uid()
      AND vp.estado = 'concluida'
  )
);

-- Sem UPDATE/DELETE para impedir alterações posteriores à avaliação.
