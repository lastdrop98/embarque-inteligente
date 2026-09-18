DO $$ BEGIN
  CREATE TYPE public.estado_pedido AS ENUM ('rascunho','submetido','em_analise','aprovado','alocado','agendado','rejeitado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.pedidos_transporte (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL DEFAULT '',
  origem text NOT NULL,
  destino text NOT NULL,
  data_viagem date NOT NULL,
  hora time without time zone,
  num_passageiros integer NOT NULL DEFAULT 1,
  categoria public.categoria_passageiro NOT NULL DEFAULT 'independente',
  delegacao_id uuid REFERENCES public.delegacoes(id) ON DELETE SET NULL,
  passageiro_id uuid REFERENCES public.passageiros(id) ON DELETE SET NULL,
  tipo_viatura text,
  observacoes text,
  estado public.estado_pedido NOT NULL DEFAULT 'rascunho',
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rota_id uuid REFERENCES public.rotas(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pedidos_estado ON public.pedidos_transporte(estado);
CREATE INDEX IF NOT EXISTS idx_pedidos_data ON public.pedidos_transporte(data_viagem);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedidos_transporte TO authenticated;
GRANT ALL ON public.pedidos_transporte TO service_role;

ALTER TABLE public.pedidos_transporte ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pedidos_select ON public.pedidos_transporte;
CREATE POLICY pedidos_select ON public.pedidos_transporte FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'operador')
  OR criado_por = auth.uid()
);

DROP POLICY IF EXISTS pedidos_insert ON public.pedidos_transporte;
CREATE POLICY pedidos_insert ON public.pedidos_transporte FOR INSERT TO authenticated
WITH CHECK (criado_por = auth.uid() AND public.conta_activa());

DROP POLICY IF EXISTS pedidos_update_gestao ON public.pedidos_transporte;
CREATE POLICY pedidos_update_gestao ON public.pedidos_transporte FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operador'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operador'));

DROP POLICY IF EXISTS pedidos_update_autor_rascunho ON public.pedidos_transporte;
CREATE POLICY pedidos_update_autor_rascunho ON public.pedidos_transporte FOR UPDATE TO authenticated
USING (criado_por = auth.uid() AND estado IN ('rascunho','submetido') AND public.conta_activa())
WITH CHECK (criado_por = auth.uid() AND public.conta_activa());

DROP POLICY IF EXISTS pedidos_delete_admin ON public.pedidos_transporte;
CREATE POLICY pedidos_delete_admin ON public.pedidos_transporte FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.tocar_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_pedidos_updated_at ON public.pedidos_transporte;
CREATE TRIGGER trg_pedidos_updated_at BEFORE UPDATE ON public.pedidos_transporte
FOR EACH ROW EXECUTE FUNCTION public.tocar_updated_at();