-- PROPOSTA (NÃO APLICADA). Rever e aplicar manualmente só depois de aprovação.
-- 1) Coordenadas verificadas para pontos predefinidos
ALTER TABLE public.pontos_predefinidos
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS coordenadas_verificadas boolean NOT NULL DEFAULT false;
ALTER TABLE public.pontos_predefinidos
  ADD CONSTRAINT pontos_lat_valida CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  ADD CONSTRAINT pontos_lng_valida CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180);
-- Pontos existentes ficam com coordenadas NULL e coordenadas_verificadas=false
-- até o operador marcar a localização no mapa.

-- 2) Marca e modelo separados nos veículos (mantém "nome" por compatibilidade)
ALTER TABLE public.veiculos
  ADD COLUMN IF NOT EXISTS marca text,
  ADD COLUMN IF NOT EXISTS modelo text;
-- Backfill aproximado (primeira palavra = marca); rever manualmente depois.
UPDATE public.veiculos
   SET marca = split_part(nome, ' ', 1),
       modelo = nullif(substr(nome, length(split_part(nome, ' ', 1)) + 2), '')
 WHERE marca IS NULL;
