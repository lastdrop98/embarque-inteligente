-- Compatibilidade entre o campo usado pelo painel do operador (data_viagem)
-- e o campo usado pelas funções de reserva (data_servico).
-- Não elimina nem substitui dados existentes.
ALTER TABLE public.rotas
  ADD COLUMN IF NOT EXISTS data_viagem date;

-- Preserva as datas já configuradas pelo operador.
UPDATE public.rotas
SET data_viagem = data_servico
WHERE data_viagem IS NULL
  AND data_servico IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sincronizar_data_rota()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.data_viagem IS NULL THEN
      NEW.data_viagem := NEW.data_servico;
    ELSIF NEW.data_servico IS NULL THEN
      NEW.data_servico := NEW.data_viagem;
    ELSIF NEW.data_viagem IS DISTINCT FROM NEW.data_servico THEN
      NEW.data_servico := NEW.data_viagem;
    END IF;
  ELSE
    IF NEW.data_viagem IS DISTINCT FROM OLD.data_viagem THEN
      NEW.data_servico := NEW.data_viagem;
    ELSIF NEW.data_servico IS DISTINCT FROM OLD.data_servico THEN
      NEW.data_viagem := NEW.data_servico;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sincronizar_data_rota ON public.rotas;
CREATE TRIGGER trg_sincronizar_data_rota
BEFORE INSERT OR UPDATE OF data_viagem, data_servico ON public.rotas
FOR EACH ROW EXECUTE FUNCTION public.sincronizar_data_rota();

NOTIFY pgrst, 'reload schema';
