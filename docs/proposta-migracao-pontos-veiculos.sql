-- Referência da migração agora versionada no repositório.
-- Migração principal: drizzle/migrations/0012_pontos_coordenadas_veiculos_marca_modelo.sql
-- Espelho para Supabase CLI: supabase/migrations/20261014100000_pontos_coordenadas_veiculos_marca_modelo.sql
-- Não executar manualmente se o pipeline de migrações já aplicou a versão 0012.
-- A migração é aditiva: não elimina registos nem tenta adivinhar marcas, modelos ou coordenadas.
-- Os pontos antigos ficam sem coordenadas e não são seleccionáveis para novas rotas até um administrador
-- escolher a localização correcta no mapa e guardar as coordenadas verificadas.

-- PROPOSTA (NÃO APLICADA). Rever antes de aplicar manualmente.
-- Coordenadas reais dos pontos predefinidos: NULL até serem escolhidas/verificadas no mapa.
ALTER TABLE public.pontos_predefinidos
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS coordenadas_verificadas boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pontos_lat_valida' AND conrelid = 'public.pontos_predefinidos'::regclass) THEN
    ALTER TABLE public.pontos_predefinidos
      ADD CONSTRAINT pontos_lat_valida CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pontos_lng_valida' AND conrelid = 'public.pontos_predefinidos'::regclass) THEN
    ALTER TABLE public.pontos_predefinidos
      ADD CONSTRAINT pontos_lng_valida CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pontos_coords_pareadas' AND conrelid = 'public.pontos_predefinidos'::regclass) THEN
    ALTER TABLE public.pontos_predefinidos
      ADD CONSTRAINT pontos_coords_pareadas CHECK ((latitude IS NULL AND longitude IS NULL) OR (latitude IS NOT NULL AND longitude IS NOT NULL));
  END IF;
END $$;

-- Campos próprios para marca/modelo, preservando nome para compatibilidade com o código legado.
ALTER TABLE public.veiculos
  ADD COLUMN IF NOT EXISTS marca text,
  ADD COLUMN IF NOT EXISTS modelo text;

-- Não preencher marca/modelo automaticamente: nomes antigos não permitem distinguir
-- com segurança marcas compostas de modelos. A revisão/preenchimento deve ser manual.
-- Esta proposta não foi aplicada. Pontos existentes não recebem coordenadas inventadas.
