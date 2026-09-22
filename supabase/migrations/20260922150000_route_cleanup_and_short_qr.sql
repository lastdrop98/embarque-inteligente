-- Gestão de limpeza de rotas e QR Codes curtos para PickApp Mobility.

CREATE OR REPLACE FUNCTION public.eliminar_todas_rotas_segura()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _total integer;
BEGIN
  IF auth.uid() IS NULL OR (
    NOT public.has_role(auth.uid(), 'admin')
    AND NOT public.has_role(auth.uid(), 'operador')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para eliminar as rotas';
  END IF;

  SELECT count(*)::integer INTO _total FROM public.rotas;

  DELETE FROM public.rotas;

  RETURN _total;
END;
$function$;

REVOKE ALL ON FUNCTION public.eliminar_todas_rotas_segura() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eliminar_todas_rotas_segura() TO authenticated;

-- Gera tokens QR curtos, seguros e compatíveis com URLs.
-- 12 caracteres hexadecimais = 48 bits de espaço de tokens.
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
    _token := substring(md5(gen_random_uuid()::text || clock_timestamp()::text || random()::text), 1, 12);

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

-- Migra tokens existentes para o novo formato curto.
UPDATE public.viagens_passageiro
SET token_qr = public.gerar_token_qr_curto();
