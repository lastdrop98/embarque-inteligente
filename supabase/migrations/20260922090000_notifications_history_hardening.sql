-- Hardening das notificações e ocultação pessoal de histórico.
-- Não elimina dados operacionais; apenas permite esconder itens da vista do utilizador.

ALTER TABLE public.notificacoes
  ADD COLUMN IF NOT EXISTS referencia_tipo text,
  ADD COLUMN IF NOT EXISTS referencia_id uuid;

CREATE INDEX IF NOT EXISTS idx_notificacoes_user_created
  ON public.notificacoes (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notificacoes_referencia
  ON public.notificacoes (referencia_tipo, referencia_id);

DROP POLICY IF EXISTS notificacoes_delete_propria ON public.notificacoes;
CREATE POLICY notificacoes_delete_propria
  ON public.notificacoes
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS notificacoes_update_own ON public.notificacoes;
CREATE POLICY notificacoes_update_own
  ON public.notificacoes
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.historico_ocultos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entidade_tipo text NOT NULL,
  entidade_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT historico_ocultos_unq UNIQUE (user_id, entidade_tipo, entidade_id)
);

ALTER TABLE public.historico_ocultos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS historico_ocultos_select_proprio ON public.historico_ocultos;
CREATE POLICY historico_ocultos_select_proprio
  ON public.historico_ocultos
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS historico_ocultos_insert_proprio ON public.historico_ocultos;
CREATE POLICY historico_ocultos_insert_proprio
  ON public.historico_ocultos
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS historico_ocultos_delete_proprio ON public.historico_ocultos;
CREATE POLICY historico_ocultos_delete_proprio
  ON public.historico_ocultos
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_historico_ocultos_user
  ON public.historico_ocultos (user_id, entidade_tipo, entidade_id);

COMMENT ON TABLE public.historico_ocultos IS
  'Itens ocultados apenas da vista histórica do próprio utilizador. Os dados operacionais originais permanecem intactos.';
