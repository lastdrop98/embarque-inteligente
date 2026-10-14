-- PickApp Mobility: verified point coordinates and explicit vehicle make/model.
-- Additive only: existing points and vehicles remain intact; legacy values are not guessed.
ALTER TABLE public.pontos_predefinidos
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS coordenadas_verificadas boolean NOT NULL DEFAULT false;

ALTER TABLE public.veiculos
  ADD COLUMN IF NOT EXISTS marca text,
  ADD COLUMN IF NOT EXISTS modelo text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pontos_predefinidos_latitude_valid'
      AND conrelid = 'public.pontos_predefinidos'::regclass
  ) THEN
    ALTER TABLE public.pontos_predefinidos
      ADD CONSTRAINT pontos_predefinidos_latitude_valid
      CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pontos_predefinidos_longitude_valid'
      AND conrelid = 'public.pontos_predefinidos'::regclass
  ) THEN
    ALTER TABLE public.pontos_predefinidos
      ADD CONSTRAINT pontos_predefinidos_longitude_valid
      CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pontos_predefinidos_coordinates_paired'
      AND conrelid = 'public.pontos_predefinidos'::regclass
  ) THEN
    ALTER TABLE public.pontos_predefinidos
      ADD CONSTRAINT pontos_predefinidos_coordinates_paired
      CHECK ((latitude IS NULL AND longitude IS NULL) OR (latitude IS NOT NULL AND longitude IS NOT NULL));
  END IF;
END $$;
