-- Endurece o ciclo de vida da rota e sincroniza horas reais com as transições.
-- embarque_fechado -> em_curso: regista partida real.
-- em_curso -> concluida: regista chegada real e exige partida real.

CREATE OR REPLACE FUNCTION public.validar_estado_rota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.estado IS NOT DISTINCT FROM OLD.estado THEN
    RETURN NEW;
  END IF;

  IF OLD.estado = 'rascunho' THEN
    IF NEW.estado NOT IN ('agendada','cancelada') THEN
      RAISE EXCEPTION 'Transição inválida da rota: rascunho -> %', NEW.estado;
    END IF;

  ELSIF OLD.estado = 'agendada' THEN
    IF NEW.estado NOT IN ('embarque_aberto','cancelada') THEN
      RAISE EXCEPTION 'Transição inválida da rota: agendada -> %', NEW.estado;
    END IF;

  ELSIF OLD.estado = 'embarque_aberto' THEN
    IF NEW.estado NOT IN ('embarque_fechado','cancelada') THEN
      RAISE EXCEPTION 'Transição inválida da rota: embarque_aberto -> %', NEW.estado;
    END IF;

  ELSIF OLD.estado = 'embarque_fechado' THEN
    IF NEW.estado <> 'em_curso' THEN
      RAISE EXCEPTION 'Transição inválida da rota: embarque_fechado -> %', NEW.estado;
    END IF;

    IF NEW.hora_partida_real IS NULL THEN
      NEW.hora_partida_real := now();
    END IF;

  ELSIF OLD.estado = 'em_curso' THEN
    IF NEW.estado <> 'concluida' THEN
      RAISE EXCEPTION 'Transição inválida da rota: em_curso -> %', NEW.estado;
    END IF;

    IF NEW.hora_partida_real IS NULL THEN
      RAISE EXCEPTION 'Não é possível concluir a rota sem hora de partida real';
    END IF;

    IF NEW.hora_chegada_real IS NULL THEN
      NEW.hora_chegada_real := now();
    END IF;

  ELSIF OLD.estado IN ('concluida','cancelada') THEN
    RAISE EXCEPTION 'A rota já está num estado final (%) e não pode ser alterada', OLD.estado;

  ELSE
    RAISE EXCEPTION 'Estado anterior desconhecido da rota: %', OLD.estado;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validar_estado_rota
ON public.rotas;

CREATE TRIGGER trg_validar_estado_rota
BEFORE UPDATE OF estado
ON public.rotas
FOR EACH ROW
EXECUTE FUNCTION public.validar_estado_rota();
