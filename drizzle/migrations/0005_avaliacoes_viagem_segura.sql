-- Avaliações seguras de viagens concluídas.
-- Idempotente quanto à criação; não elimina nem reescreve avaliações existentes.
CREATE TABLE IF NOT EXISTS public.avaliacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viagem_id uuid NOT NULL REFERENCES public.viagens_passageiro(id) ON DELETE CASCADE,
  nota integer NOT NULL CHECK (nota BETWEEN 1 AND 5),
  comentario text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS avaliacoes_viagem_id_uidx
  ON public.avaliacoes (viagem_id);

ALTER TABLE public.avaliacoes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.avaliacoes TO authenticated;
REVOKE ALL ON public.avaliacoes FROM anon;

-- O trigger reforça as regras mesmo que existam outras políticas permissivas antigas.
CREATE OR REPLACE FUNCTION public.validar_avaliacao_viagem()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _dono uuid;
  _estado text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'As avaliações não podem ser alteradas ou apagadas.';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'É necessário iniciar sessão para avaliar uma viagem.';
  END IF;

  IF NEW.nota IS NULL OR NEW.nota < 1 OR NEW.nota > 5 THEN
    RAISE EXCEPTION 'A avaliação deve ser de 1 a 5 estrelas.';
  END IF;

  IF NEW.comentario IS NOT NULL AND length(NEW.comentario) > 2000 THEN
    RAISE EXCEPTION 'O comentário não pode exceder 2000 caracteres.';
  END IF;

  SELECT p.user_id, vp.estado::text
    INTO _dono, _estado
  FROM public.viagens_passageiro vp
  JOIN public.passageiros p ON p.id = vp.passageiro_id
  WHERE vp.id = NEW.viagem_id;

  IF _dono IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Só o passageiro inscrito pode avaliar esta viagem.';
  END IF;

  IF _estado IS DISTINCT FROM 'concluida' THEN
    RAISE EXCEPTION 'Só é possível avaliar uma viagem concluída.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_avaliacao_viagem ON public.avaliacoes;
CREATE TRIGGER trg_validar_avaliacao_viagem
BEFORE INSERT OR UPDATE OR DELETE ON public.avaliacoes
FOR EACH ROW EXECUTE FUNCTION public.validar_avaliacao_viagem();

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

-- Sem concessão de UPDATE/DELETE. O trigger também bloqueia estas operações
-- caso permissões mais antigas tenham sido concedidas noutro momento.
