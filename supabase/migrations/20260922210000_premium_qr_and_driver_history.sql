-- Códigos de embarque mais curtos e histórico pessoal do motorista.
-- O histórico ocultado é apenas uma preferência do utilizador; os dados operacionais
-- permanecem intactos para administração e auditoria.

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
    -- 6 bytes = 8 caracteres base64url, sem padding.
    _token := translate(encode(gen_random_bytes(6), 'base64'), '+/', '-_');

    IF length(_token) = 8
       AND NOT EXISTS (
         SELECT 1 FROM public.viagens_passageiro WHERE token_qr = _token
       ) THEN
      RETURN _token;
    END IF;
  END LOOP;
END;
$function$;

ALTER TABLE public.viagens_passageiro
  ALTER COLUMN token_qr SET DEFAULT public.gerar_token_qr_curto();

UPDATE public.viagens_passageiro v
SET token_qr = public.gerar_token_qr_curto();

CREATE INDEX IF NOT EXISTS idx_historico_ocultos_driver_route
  ON public.historico_ocultos (user_id, entidade_tipo, entidade_id)
  WHERE entidade_tipo = 'rota';

COMMENT ON FUNCTION public.gerar_token_qr_curto() IS
  'Gera um identificador QR/scan de 8 caracteres base64url.';
