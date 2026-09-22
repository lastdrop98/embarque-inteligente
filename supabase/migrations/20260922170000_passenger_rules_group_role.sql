-- Regras operacionais do PickApp Mobility:
-- pedidos de viagem, pontos predefinidos, limite de um pedido activo,
-- QR curto e novo papel Responsável de Grupo.

ALTER TYPE public.app_role
  ADD VALUE IF NOT EXISTS 'responsavel_grupo';

-- Um passageiro não pode manter mais de uma solicitação activa.
-- Pedidos cancelados/rejeitados continuam disponíveis no histórico.
DO $$
BEGIN
  UPDATE public.pedidos_transporte p
  SET estado = 'cancelado'
  WHERE p.id IN (
    SELECT id
    FROM (
      SELECT id,
             row_number() OVER (
               PARTITION BY passageiro_id
               ORDER BY created_at DESC, id DESC
             ) AS rn
      FROM public.pedidos_transporte
      WHERE passageiro_id IS NOT NULL
        AND estado IN ('rascunho','submetido','em_analise','aprovado','alocado','agendado')
    ) x
    WHERE x.rn > 1
  );
EXCEPTION
  WHEN undefined_column THEN
    NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_pedido_passageiro_unico_activo
ON public.pedidos_transporte (passageiro_id)
WHERE passageiro_id IS NOT NULL
  AND estado IN ('rascunho','submetido','em_analise','aprovado','alocado','agendado');

-- Os pontos de origem/destino usados por pedidos têm de existir
-- na lista de paragens previamente criada pelo operador.
CREATE OR REPLACE FUNCTION public.validar_pontos_pedido()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.paragens WHERE lower(trim(nome)) = lower(trim(NEW.origem))
  ) THEN
    RAISE EXCEPTION 'Ponto de origem inválido. Escolha um ponto de embarque predefinido.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.paragens WHERE lower(trim(nome)) = lower(trim(NEW.destino))
  ) THEN
    RAISE EXCEPTION 'Destino inválido. Escolha um ponto predefinido.';
  END IF;

  IF lower(trim(NEW.origem)) = lower(trim(NEW.destino)) THEN
    RAISE EXCEPTION 'A origem e o destino devem ser diferentes.';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validar_pontos_pedido
ON public.pedidos_transporte;

CREATE TRIGGER trg_validar_pontos_pedido
BEFORE INSERT OR UPDATE OF origem, destino
ON public.pedidos_transporte
FOR EACH ROW
EXECUTE FUNCTION public.validar_pontos_pedido();

-- QR manualmente legível: 8 caracteres hexadecimais.
CREATE OR REPLACE FUNCTION public.gerar_token_qr_curto()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $function$
DECLARE
  _token text;
BEGIN
  LOOP
    _token := upper(substring(md5(gen_random_uuid()::text || clock_timestamp()::text || random()::text), 1, 8));
    IF NOT EXISTS (
      SELECT 1 FROM public.viagens_passageiro WHERE token_qr = _token
    ) THEN
      RETURN _token;
    END IF;
  END LOOP;
END;
$function$;

ALTER TABLE public.viagens_passageiro
  ALTER COLUMN token_qr SET DEFAULT public.gerar_token_qr_curto();

UPDATE public.viagens_passageiro
SET token_qr = public.gerar_token_qr_curto();

-- Compatibilidade: o novo papel é lido pelos utilizadores autenticados.
GRANT USAGE ON TYPE public.app_role TO authenticated;
