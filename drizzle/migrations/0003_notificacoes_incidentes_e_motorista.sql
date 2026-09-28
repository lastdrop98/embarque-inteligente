-- Bilhete criado: avisar também o motorista atribuído à rota (se existir).
CREATE OR REPLACE FUNCTION public.notificar_bilhete_evento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _passageiro_user uuid; _operacionais uuid[]; _rota text; _motorista uuid;
BEGIN
  SELECT p.user_id INTO _passageiro_user FROM public.passageiros p WHERE p.id=NEW.passageiro_id;
  SELECT r.nome, r.motorista_id INTO _rota, _motorista FROM public.rotas r WHERE r.id=NEW.rota_id;
  SELECT COALESCE(array_agg(DISTINCT pu.user_id),ARRAY[]::uuid[]) INTO _operacionais
  FROM public.papeis_utilizador pu WHERE pu.role::text IN ('admin','operador');

  IF TG_OP='INSERT' THEN
    IF _passageiro_user IS NOT NULL THEN
      PERFORM public.notificar_evento('bilhete_criado','viagem',NEW.id,
        'O seu bilhete de transporte foi criado' || CASE WHEN _rota IS NOT NULL THEN ' para a rota '||_rota||'.' ELSE '.' END,
        ARRAY[_passageiro_user]);
    END IF;
    PERFORM public.notificar_evento('bilhete_criado','viagem',NEW.id,'Novo bilhete criado para uma viagem.',_operacionais);
    IF _motorista IS NOT NULL THEN
      PERFORM public.notificar_evento('bilhete_criado','viagem',NEW.id,
        'Novo passageiro atribuído à rota '||COALESCE(_rota,'')||'.',ARRAY[_motorista]);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Incidentes: admin + operador sempre; motorista e passageiros apenas da rota envolvida.
CREATE OR REPLACE FUNCTION public.notificar_incidente_evento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _operacionais uuid[]; _passageiros uuid[]; _motorista uuid; _rota text; _msg text;
BEGIN
  SELECT COALESCE(array_agg(DISTINCT pu.user_id),ARRAY[]::uuid[]) INTO _operacionais
  FROM public.papeis_utilizador pu WHERE pu.role::text IN ('admin','operador');

  IF NEW.rota_id IS NOT NULL THEN
    SELECT r.nome, r.motorista_id INTO _rota, _motorista FROM public.rotas r WHERE r.id=NEW.rota_id;
  END IF;

  IF TG_OP='INSERT' THEN
    _msg := 'Nova ocorrência'||CASE WHEN _rota IS NOT NULL THEN ' na rota '||_rota ELSE '' END||': '||COALESCE(NEW.tipo, NEW.descricao)||'.';
    PERFORM public.notificar_evento('incidente_aberto','incidente',NEW.id,_msg,_operacionais);
    IF _motorista IS NOT NULL AND _motorista IS DISTINCT FROM NEW.motorista_id THEN
      PERFORM public.notificar_evento('incidente_aberto','incidente',NEW.id,_msg,ARRAY[_motorista]);
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado AND NEW.estado = 'resolvido' THEN
    _msg := 'Ocorrência resolvida'||CASE WHEN _rota IS NOT NULL THEN ' na rota '||_rota ELSE '' END||'.';
    PERFORM public.notificar_evento('incidente_resolvido','incidente',NEW.id,_msg,_operacionais);
    IF NEW.motorista_id IS NOT NULL THEN
      PERFORM public.notificar_evento('incidente_resolvido','incidente',NEW.id,_msg,ARRAY[NEW.motorista_id]);
    END IF;
    IF NEW.rota_id IS NOT NULL THEN
      SELECT COALESCE(array_agg(DISTINCT p.user_id) FILTER (WHERE p.user_id IS NOT NULL),ARRAY[]::uuid[])
      INTO _passageiros
      FROM public.viagens_passageiro vp JOIN public.passageiros p ON p.id=vp.passageiro_id
      WHERE vp.rota_id=NEW.rota_id AND vp.estado::text IN ('pendente','a_bordo');
      PERFORM public.notificar_evento('incidente_resolvido','incidente',NEW.id,
        'A ocorrência na sua rota foi resolvida.',_passageiros);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notificar_incidente_evento ON public.incidentes;
CREATE TRIGGER trg_notificar_incidente_evento
AFTER INSERT OR UPDATE OF estado ON public.incidentes
FOR EACH ROW EXECUTE FUNCTION public.notificar_incidente_evento();