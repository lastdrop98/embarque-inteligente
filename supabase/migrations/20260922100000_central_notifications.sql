-- Centralização das notificações do Embarque Inteligente.
-- Não apaga dados operacionais; substitui o trigger antigo de estado da viagem.

DROP TRIGGER IF EXISTS trg_notificar_estado ON public.viagens_passageiro;
DROP FUNCTION IF EXISTS public.notificar_estado_viagem();

CREATE OR REPLACE FUNCTION public.notificar_evento(
  p_tipo text,
  p_referencia_tipo text,
  p_referencia_id uuid,
  p_mensagem text,
  p_user_ids uuid[] DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid;
BEGIN
  IF p_tipo IS NULL OR p_referencia_tipo IS NULL OR p_referencia_id IS NULL OR p_mensagem IS NULL OR p_user_ids IS NULL THEN RETURN; END IF;
  FOREACH _uid IN ARRAY p_user_ids LOOP
    IF _uid IS NOT NULL THEN
      INSERT INTO public.notificacoes (user_id,tipo,mensagem,lida,referencia_tipo,referencia_id)
      SELECT _uid,p_tipo,p_mensagem,false,p_referencia_tipo,p_referencia_id
      WHERE NOT EXISTS (
        SELECT 1 FROM public.notificacoes n
        WHERE n.user_id=_uid AND n.tipo=p_tipo
          AND n.referencia_tipo=p_referencia_tipo
          AND n.referencia_id=p_referencia_id
      );
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.notificar_evento(text,text,uuid,text,uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notificar_evento(text,text,uuid,text,uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.notificar_pedido_evento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  _passageiro_user uuid; _operacionais uuid[]; _tipo text; _msg text;
BEGIN
  SELECT p.user_id INTO _passageiro_user FROM public.passageiros p WHERE p.id=NEW.passageiro_id;
  SELECT COALESCE(array_agg(DISTINCT pu.user_id),ARRAY[]::uuid[]) INTO _operacionais
  FROM public.papeis_utilizador pu WHERE pu.role::text IN ('admin','operador');

  IF TG_OP='INSERT' THEN
    PERFORM public.notificar_evento('pedido_submetido','pedido',NEW.id,'Novo pedido de transporte submetido.',_operacionais);
    RETURN NEW;
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    CASE NEW.estado::text
      WHEN 'aprovado' THEN _tipo:='pedido_aprovado'; _msg:='O seu pedido de transporte foi aprovado.';
      WHEN 'rejeitado' THEN _tipo:='pedido_rejeitado'; _msg:='O seu pedido de transporte foi rejeitado.';
      WHEN 'alocado' THEN _tipo:='pedido_alocado'; _msg:='O seu pedido de transporte foi alocado a uma rota.';
      WHEN 'agendado' THEN _tipo:='pedido_agendado'; _msg:='O seu transporte foi agendado.';
      ELSE _tipo:=NULL;
    END CASE;
    IF _tipo IS NOT NULL THEN
      IF _passageiro_user IS NOT NULL THEN
        PERFORM public.notificar_evento(_tipo,'pedido',NEW.id,_msg,ARRAY[_passageiro_user]);
      END IF;
      PERFORM public.notificar_evento(_tipo,'pedido',NEW.id,_msg,_operacionais);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notificar_pedido_evento ON public.pedidos_transporte;
CREATE TRIGGER trg_notificar_pedido_evento
AFTER INSERT OR UPDATE OF estado ON public.pedidos_transporte
FOR EACH ROW EXECUTE FUNCTION public.notificar_pedido_evento();

CREATE OR REPLACE FUNCTION public.notificar_bilhete_evento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  _passageiro_user uuid; _operacionais uuid[]; _rota text;
BEGIN
  SELECT p.user_id INTO _passageiro_user FROM public.passageiros p WHERE p.id=NEW.passageiro_id;
  SELECT r.nome INTO _rota FROM public.rotas r WHERE r.id=NEW.rota_id;
  SELECT COALESCE(array_agg(DISTINCT pu.user_id),ARRAY[]::uuid[]) INTO _operacionais
  FROM public.papeis_utilizador pu WHERE pu.role::text IN ('admin','operador');

  IF TG_OP='INSERT' THEN
    IF _passageiro_user IS NOT NULL THEN
      PERFORM public.notificar_evento('bilhete_criado','viagem',NEW.id,
        'O seu bilhete de transporte foi criado' || CASE WHEN _rota IS NOT NULL THEN ' para a rota '||_rota||'.' ELSE '.' END,
        ARRAY[_passageiro_user]);
    END IF;
    PERFORM public.notificar_evento('bilhete_criado','viagem',NEW.id,'Novo bilhete criado para uma viagem.',_operacionais);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notificar_bilhete_evento ON public.viagens_passageiro;
CREATE TRIGGER trg_notificar_bilhete_evento
AFTER INSERT ON public.viagens_passageiro
FOR EACH ROW EXECUTE FUNCTION public.notificar_bilhete_evento();

CREATE OR REPLACE FUNCTION public.notificar_viagem_estado_evento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  _passageiro_user uuid; _operacionais uuid[]; _rota text; _tipo text; _msg text;
BEGIN
  IF NEW.estado IS NOT DISTINCT FROM OLD.estado THEN RETURN NEW; END IF;
  SELECT p.user_id INTO _passageiro_user FROM public.passageiros p WHERE p.id=NEW.passageiro_id;
  SELECT r.nome INTO _rota FROM public.rotas r WHERE r.id=NEW.rota_id;
  SELECT COALESCE(array_agg(DISTINCT pu.user_id),ARRAY[]::uuid[]) INTO _operacionais
  FROM public.papeis_utilizador pu WHERE pu.role::text IN ('admin','operador');

  CASE NEW.estado::text
    WHEN 'a_bordo' THEN _tipo:='passageiro_embarcado'; _msg:='Embarque confirmado'||CASE WHEN _rota IS NOT NULL THEN ' na rota '||_rota ELSE '' END||'.';
    WHEN 'desembarcado' THEN _tipo:='passageiro_desembarcado'; _msg:='Desembarque confirmado'||CASE WHEN _rota IS NOT NULL THEN ' na rota '||_rota ELSE '' END||'.';
    WHEN 'concluida' THEN _tipo:='viagem_concluida'; _msg:='A sua viagem foi concluída'||CASE WHEN _rota IS NOT NULL THEN ' na rota '||_rota ELSE '' END||'.';
    ELSE RETURN NEW;
  END CASE;

  IF _passageiro_user IS NOT NULL THEN
    PERFORM public.notificar_evento(_tipo,'viagem',NEW.id,_msg,ARRAY[_passageiro_user]);
  END IF;
  PERFORM public.notificar_evento(_tipo,'viagem',NEW.id,
    CASE NEW.estado::text WHEN 'a_bordo' THEN 'Um passageiro foi embarcado numa viagem.'
      WHEN 'desembarcado' THEN 'Um passageiro foi desembarcado numa viagem.'
      ELSE 'Uma viagem de passageiro foi concluída.' END,
    _operacionais);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notificar_viagem_estado_evento ON public.viagens_passageiro;
CREATE TRIGGER trg_notificar_viagem_estado_evento
AFTER UPDATE OF estado ON public.viagens_passageiro
FOR EACH ROW EXECUTE FUNCTION public.notificar_viagem_estado_evento();

CREATE OR REPLACE FUNCTION public.notificar_rota_evento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  _operacionais uuid[]; _passageiros uuid[]; _tipo text; _msg text;
BEGIN
  SELECT COALESCE(array_agg(DISTINCT pu.user_id),ARRAY[]::uuid[]) INTO _operacionais
  FROM public.papeis_utilizador pu WHERE pu.role::text IN ('admin','operador');

  IF NEW.motorista_id IS DISTINCT FROM OLD.motorista_id AND NEW.motorista_id IS NOT NULL THEN
    PERFORM public.notificar_evento('rota_atribuida_motorista','rota',NEW.id,
      'Foi-lhe atribuída a rota '||COALESCE(NEW.nome,'')||'.',ARRAY[NEW.motorista_id]);
    PERFORM public.notificar_evento('rota_atribuida_motorista','rota',NEW.id,
      'Motorista atribuído à rota '||COALESCE(NEW.nome,'')||'.',_operacionais);
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    CASE NEW.estado::text
      WHEN 'embarque_aberto' THEN _tipo:='embarque_aberto'; _msg:='O embarque está aberto na rota '||COALESCE(NEW.nome,'')||'.';
      WHEN 'embarque_fechado' THEN _tipo:='embarque_fechado'; _msg:='O embarque foi fechado na rota '||COALESCE(NEW.nome,'')||'.';
      WHEN 'em_curso' THEN _tipo:='rota_em_curso'; _msg:='A rota '||COALESCE(NEW.nome,'')||' iniciou o percurso.';
      WHEN 'concluida' THEN _tipo:='rota_concluida'; _msg:='A rota '||COALESCE(NEW.nome,'')||' foi concluída.';
      ELSE _tipo:=NULL;
    END CASE;

    IF _tipo IS NOT NULL THEN
      SELECT COALESCE(array_agg(DISTINCT p.user_id) FILTER (WHERE p.user_id IS NOT NULL),ARRAY[]::uuid[])
      INTO _passageiros
      FROM public.viagens_passageiro vp JOIN public.passageiros p ON p.id=vp.passageiro_id
      WHERE vp.rota_id=NEW.id;

      PERFORM public.notificar_evento(_tipo,'rota',NEW.id,_msg,_passageiros);
      PERFORM public.notificar_evento(_tipo,'rota',NEW.id,_msg,_operacionais);
      IF NEW.motorista_id IS NOT NULL THEN
        PERFORM public.notificar_evento(_tipo,'rota',NEW.id,_msg,ARRAY[NEW.motorista_id]);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notificar_rota_evento ON public.rotas;
CREATE TRIGGER trg_notificar_rota_evento
AFTER UPDATE OF motorista_id, estado ON public.rotas
FOR EACH ROW EXECUTE FUNCTION public.notificar_rota_evento();

COMMENT ON FUNCTION public.notificar_evento(text,text,uuid,text,uuid[])
IS 'Centraliza notificações por evento, destinatário e referência, com deduplicação.';
