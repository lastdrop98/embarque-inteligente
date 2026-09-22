-- Limpeza inicial solicitada para preparar o PickApp Mobility.
-- Remove as rotas actualmente existentes; as FKs configuradas tratam
-- paragens, viagens e registos dependentes conforme o schema.
DELETE FROM public.rotas;
