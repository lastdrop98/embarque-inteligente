-- Enforce at most one active passenger trip globally, including concurrent bookings.
-- Existing rows are not deleted or rewritten. Existing duplicates remain visible for reconciliation;
-- new inserts/updates to active states are blocked until each passenger has at most one active trip.
CREATE OR REPLACE FUNCTION public.impedir_viagem_ativa_duplicada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.passageiro_id IS NULL OR NEW.estado::text NOT IN ('pendente', 'a_bordo') THEN
    RETURN NEW;
  END IF;

  -- Serialize active-trip checks per passenger to prevent concurrent double bookings.
  PERFORM pg_advisory_xact_lock(hashtext(NEW.passageiro_id::text)::bigint);

  IF EXISTS (
    SELECT 1
    FROM public.viagens_passageiro vp
    WHERE vp.passageiro_id = NEW.passageiro_id
      AND vp.id IS DISTINCT FROM NEW.id
      AND vp.estado::text IN ('pendente', 'a_bordo')
  ) THEN
    RAISE EXCEPTION 'Já tem uma viagem activa. Conclua ou cancele a viagem actual antes de reservar outra.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_uma_viagem_ativa_por_passageiro ON public.viagens_passageiro;
CREATE TRIGGER trg_uma_viagem_ativa_por_passageiro
BEFORE INSERT OR UPDATE OF estado, passageiro_id ON public.viagens_passageiro
FOR EACH ROW EXECUTE FUNCTION public.impedir_viagem_ativa_duplicada();
