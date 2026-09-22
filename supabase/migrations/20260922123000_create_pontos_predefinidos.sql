-- Pontos predefinidos usados pelo painel administrativo e pelos pedidos de viagem.
CREATE TABLE IF NOT EXISTS public.pontos_predefinidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pontos_predefinidos_nome_lower_uidx
  ON public.pontos_predefinidos (lower(trim(nome)));

ALTER TABLE public.pontos_predefinidos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pontos_predefinidos_select_active ON public.pontos_predefinidos;
CREATE POLICY pontos_predefinidos_select_active
  ON public.pontos_predefinidos
  FOR SELECT
  TO authenticated
  USING (
    activo = true
    OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS pontos_predefinidos_admin_insert ON public.pontos_predefinidos;
CREATE POLICY pontos_predefinidos_admin_insert
  ON public.pontos_predefinidos
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS pontos_predefinidos_admin_update ON public.pontos_predefinidos;
CREATE POLICY pontos_predefinidos_admin_update
  ON public.pontos_predefinidos
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS pontos_predefinidos_admin_delete ON public.pontos_predefinidos;
CREATE POLICY pontos_predefinidos_admin_delete
  ON public.pontos_predefinidos
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.pontos_predefinidos TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pontos_predefinidos TO authenticated;
