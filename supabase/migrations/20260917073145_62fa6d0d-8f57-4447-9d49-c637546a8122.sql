-- 1. Colunas novas
ALTER TABLE public.perfis ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;
ALTER TABLE public.passageiros ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE INDEX IF NOT EXISTS passageiros_user_id_idx ON public.passageiros(user_id);
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS longitude double precision;
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS posicao_updated_at timestamptz;
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'inactivo';

-- 2. Funções auxiliares
CREATE OR REPLACE FUNCTION public.conta_activa()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT activo FROM public.perfis WHERE id = auth.uid()), true);
$$;

CREATE OR REPLACE FUNCTION public.pode_gerir_rota(_rota_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.conta_activa() AND (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'operador')
    OR EXISTS (SELECT 1 FROM public.rotas r WHERE r.id = _rota_id AND r.motorista_id = auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.pode_ver_rota(_rota_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.pode_gerir_rota(_rota_id)
    OR (public.conta_activa() AND EXISTS (
      SELECT 1 FROM public.viagens_passageiro v
      JOIN public.passageiros p ON p.id = v.passageiro_id
      WHERE v.rota_id = _rota_id AND p.user_id = auth.uid()
    ));
$$;

REVOKE ALL ON FUNCTION public.conta_activa() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pode_gerir_rota(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pode_ver_rota(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auto_confirm_email() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.conta_activa() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pode_gerir_rota(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pode_ver_rota(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- 3. Registo público nunca pode criar admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _papel public.app_role;
BEGIN
  INSERT INTO public.perfis (id, nome, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome',''), COALESCE(NEW.email,''))
  ON CONFLICT (id) DO NOTHING;

  _papel := CASE COALESCE(NEW.raw_user_meta_data->>'papel','motorista')
    WHEN 'operador' THEN 'operador'::public.app_role
    WHEN 'passageiro' THEN 'passageiro'::public.app_role
    ELSE 'motorista'::public.app_role
  END;

  INSERT INTO public.papeis_utilizador (user_id, role)
  VALUES (NEW.id, _papel)
  ON CONFLICT DO NOTHING;

  IF _papel = 'passageiro' THEN
    INSERT INTO public.passageiros (nome, contacto, user_id)
    VALUES (COALESCE(NEW.raw_user_meta_data->>'nome','Passageiro'), COALESCE(NEW.email,''), NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- 4. Auditoria de papéis
CREATE TABLE IF NOT EXISTS public.registo_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  utilizador_alvo uuid NOT NULL,
  alterado_por uuid,
  papel_anterior public.app_role,
  papel_novo public.app_role,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.registo_auditoria TO authenticated;
GRANT ALL ON public.registo_auditoria TO service_role;
ALTER TABLE public.registo_auditoria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auditoria_select_admin ON public.registo_auditoria;
CREATE POLICY auditoria_select_admin ON public.registo_auditoria FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.auditar_papel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.registo_auditoria (utilizador_alvo, alterado_por, papel_anterior, papel_novo)
    VALUES (NEW.user_id, auth.uid(), NULL, NEW.role);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.registo_auditoria (utilizador_alvo, alterado_por, papel_anterior, papel_novo)
    VALUES (NEW.user_id, auth.uid(), OLD.role, NEW.role);
    RETURN NEW;
  ELSE
    INSERT INTO public.registo_auditoria (utilizador_alvo, alterado_por, papel_anterior, papel_novo)
    VALUES (OLD.user_id, auth.uid(), OLD.role, NULL);
    RETURN OLD;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.auditar_papel() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_auditar_papel ON public.papeis_utilizador;
CREATE TRIGGER trg_auditar_papel AFTER INSERT OR UPDATE OR DELETE ON public.papeis_utilizador
  FOR EACH ROW EXECUTE FUNCTION public.auditar_papel();

-- 5. Incidentes
CREATE TABLE IF NOT EXISTS public.incidentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rota_id uuid REFERENCES public.rotas(id) ON DELETE SET NULL,
  motorista_id uuid,
  descricao text NOT NULL,
  estado text NOT NULL DEFAULT 'aberto',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.incidentes TO authenticated;
GRANT ALL ON public.incidentes TO service_role;
ALTER TABLE public.incidentes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS incidentes_select ON public.incidentes;
CREATE POLICY incidentes_select ON public.incidentes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operador') OR motorista_id = auth.uid());
DROP POLICY IF EXISTS incidentes_insert ON public.incidentes;
CREATE POLICY incidentes_insert ON public.incidentes FOR INSERT TO authenticated
  WITH CHECK (motorista_id = auth.uid() AND public.conta_activa());
DROP POLICY IF EXISTS incidentes_update_gestao ON public.incidentes;
CREATE POLICY incidentes_update_gestao ON public.incidentes FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operador'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operador'));

-- 6. Notificações
CREATE TABLE IF NOT EXISTS public.notificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tipo text NOT NULL DEFAULT 'info',
  mensagem text NOT NULL,
  lida boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notificacoes_user_idx ON public.notificacoes(user_id, created_at DESC);
GRANT SELECT, UPDATE ON public.notificacoes TO authenticated;
GRANT ALL ON public.notificacoes TO service_role;
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notificacoes_select ON public.notificacoes;
CREATE POLICY notificacoes_select ON public.notificacoes FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS notificacoes_update_own ON public.notificacoes;
CREATE POLICY notificacoes_update_own ON public.notificacoes FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.notificar_estado_viagem()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _user uuid;
  _rota text;
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado AND NEW.estado IN ('a_bordo','concluida') THEN
    SELECT p.user_id INTO _user FROM public.passageiros p WHERE p.id = NEW.passageiro_id;
    IF _user IS NOT NULL THEN
      SELECT r.nome INTO _rota FROM public.rotas r WHERE r.id = NEW.rota_id;
      INSERT INTO public.notificacoes (user_id, tipo, mensagem)
      VALUES (_user, NEW.estado::text,
        CASE WHEN NEW.estado = 'a_bordo'
          THEN 'Embarque confirmado na rota ' || COALESCE(_rota,'')
          ELSE 'Viagem concluída na rota ' || COALESCE(_rota,'') END);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notificar_estado_viagem() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_notificar_estado ON public.viagens_passageiro;
CREATE TRIGGER trg_notificar_estado AFTER UPDATE ON public.viagens_passageiro
  FOR EACH ROW EXECUTE FUNCTION public.notificar_estado_viagem();

-- 7. Avaliações
CREATE TABLE IF NOT EXISTS public.avaliacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viagem_id uuid NOT NULL UNIQUE REFERENCES public.viagens_passageiro(id) ON DELETE CASCADE,
  nota integer NOT NULL CHECK (nota BETWEEN 1 AND 5),
  comentario text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.avaliacoes TO authenticated;
GRANT ALL ON public.avaliacoes TO service_role;
ALTER TABLE public.avaliacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS avaliacoes_select ON public.avaliacoes;
CREATE POLICY avaliacoes_select ON public.avaliacoes FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operador')
    OR EXISTS (SELECT 1 FROM public.viagens_passageiro v JOIN public.passageiros p ON p.id = v.passageiro_id
               WHERE v.id = viagem_id AND p.user_id = auth.uid())
  );
DROP POLICY IF EXISTS avaliacoes_insert_passageiro ON public.avaliacoes;
CREATE POLICY avaliacoes_insert_passageiro ON public.avaliacoes FOR INSERT TO authenticated
  WITH CHECK (
    public.conta_activa() AND EXISTS (
      SELECT 1 FROM public.viagens_passageiro v JOIN public.passageiros p ON p.id = v.passageiro_id
      WHERE v.id = viagem_id AND p.user_id = auth.uid() AND v.estado = 'concluida'
    )
  );

-- 8. Policies actualizadas nas tabelas existentes
DROP POLICY IF EXISTS papeis_select_self_or_operador ON public.papeis_utilizador;
CREATE POLICY papeis_select_self_or_operador ON public.papeis_utilizador FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'operador') OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS papeis_admin_insert ON public.papeis_utilizador;
CREATE POLICY papeis_admin_insert ON public.papeis_utilizador FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS papeis_admin_update ON public.papeis_utilizador;
CREATE POLICY papeis_admin_update ON public.papeis_utilizador FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS papeis_admin_delete ON public.papeis_utilizador;
CREATE POLICY papeis_admin_delete ON public.papeis_utilizador FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.papeis_utilizador TO authenticated;

DROP POLICY IF EXISTS perfis_select_self_or_operador ON public.perfis;
CREATE POLICY perfis_select_self_or_operador ON public.perfis FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(),'operador') OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS perfis_update_admin ON public.perfis;
CREATE POLICY perfis_update_admin ON public.perfis FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS rotas_select ON public.rotas;
CREATE POLICY rotas_select ON public.rotas FOR SELECT TO authenticated
  USING (public.pode_ver_rota(id));
DROP POLICY IF EXISTS rotas_write_admin ON public.rotas;
CREATE POLICY rotas_write_admin ON public.rotas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS paragens_write_admin ON public.paragens;
CREATE POLICY paragens_write_admin ON public.paragens FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS passageiros_select ON public.passageiros;
CREATE POLICY passageiros_select ON public.passageiros FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'operador')
    OR user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.viagens_passageiro v JOIN public.rotas r ON r.id = v.rota_id
               WHERE v.passageiro_id = passageiros.id AND r.motorista_id = auth.uid())
  );
DROP POLICY IF EXISTS passageiros_write_admin ON public.passageiros;
CREATE POLICY passageiros_write_admin ON public.passageiros FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS viagens_select ON public.viagens_passageiro;
CREATE POLICY viagens_select ON public.viagens_passageiro FOR SELECT TO authenticated
  USING (
    public.pode_gerir_rota(rota_id)
    OR EXISTS (SELECT 1 FROM public.passageiros p WHERE p.id = passageiro_id AND p.user_id = auth.uid())
  );
DROP POLICY IF EXISTS viagens_write_admin ON public.viagens_passageiro;
CREATE POLICY viagens_write_admin ON public.viagens_passageiro FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS veiculos_update_motorista ON public.veiculos;
CREATE POLICY veiculos_update_motorista ON public.veiculos FOR UPDATE TO authenticated
  USING (public.conta_activa() AND EXISTS (
    SELECT 1 FROM public.rotas r WHERE r.veiculo_id = veiculos.id AND r.motorista_id = auth.uid()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.rotas r WHERE r.veiculo_id = veiculos.id AND r.motorista_id = auth.uid()));
DROP POLICY IF EXISTS veiculos_write_admin ON public.veiculos;
CREATE POLICY veiculos_write_admin ON public.veiculos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS registos_select ON public.registos_embarque;
CREATE POLICY registos_select ON public.registos_embarque FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operador') OR registado_por = auth.uid());

-- 9. Tempo real
ALTER PUBLICATION supabase_realtime ADD TABLE public.veiculos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.incidentes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notificacoes;