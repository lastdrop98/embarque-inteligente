CREATE TYPE public.app_role AS ENUM ('operador','motorista');
CREATE TYPE public.estado_viagem AS ENUM ('pendente','a_bordo','concluida','recusada');
CREATE TYPE public.tipo_registo AS ENUM ('embarque','desembarque');
CREATE TYPE public.resultado_registo AS ENUM ('aprovado','recusado');

CREATE TABLE public.perfis (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.perfis TO authenticated;
GRANT ALL ON public.perfis TO service_role;
ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.papeis_utilizador (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT, INSERT ON public.papeis_utilizador TO authenticated;
GRANT ALL ON public.papeis_utilizador TO service_role;
ALTER TABLE public.papeis_utilizador ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.papeis_utilizador WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.perfis (id, nome, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome',''), COALESCE(NEW.email,''))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.papeis_utilizador (user_id, role)
  VALUES (NEW.id, COALESCE((NEW.raw_user_meta_data->>'papel')::public.app_role, 'motorista'))
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE POLICY "perfis_select_self_or_operador" ON public.perfis FOR SELECT TO authenticated
USING (id = auth.uid() OR public.has_role(auth.uid(),'operador'));
CREATE POLICY "perfis_update_self" ON public.perfis FOR UPDATE TO authenticated
USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "papeis_select_self_or_operador" ON public.papeis_utilizador FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(),'operador'));

CREATE TABLE public.veiculos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  matricula text NOT NULL DEFAULT '',
  lugares integer NOT NULL DEFAULT 20,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.veiculos TO authenticated;
GRANT ALL ON public.veiculos TO service_role;
ALTER TABLE public.veiculos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "veiculos_select_auth" ON public.veiculos FOR SELECT TO authenticated USING (true);
CREATE POLICY "veiculos_write_operador" ON public.veiculos FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'operador')) WITH CHECK (public.has_role(auth.uid(),'operador'));

CREATE TABLE public.rotas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  veiculo_id uuid REFERENCES public.veiculos(id) ON DELETE SET NULL,
  motorista_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  hora_inicio time,
  hora_fim time,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rotas TO authenticated;
GRANT ALL ON public.rotas TO service_role;
ALTER TABLE public.rotas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rotas_select" ON public.rotas FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'operador') OR motorista_id = auth.uid());
CREATE POLICY "rotas_write_operador" ON public.rotas FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'operador')) WITH CHECK (public.has_role(auth.uid(),'operador'));

CREATE OR REPLACE FUNCTION public.pode_ver_rota(_rota_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(),'operador')
      OR EXISTS (SELECT 1 FROM public.rotas r WHERE r.id = _rota_id AND r.motorista_id = auth.uid());
$$;

CREATE TABLE public.paragens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rota_id uuid NOT NULL REFERENCES public.rotas(id) ON DELETE CASCADE,
  ordem integer NOT NULL DEFAULT 1,
  nome text NOT NULL,
  latitude double precision,
  longitude double precision,
  hora_prevista time,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.paragens TO authenticated;
GRANT ALL ON public.paragens TO service_role;
ALTER TABLE public.paragens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "paragens_select" ON public.paragens FOR SELECT TO authenticated USING (public.pode_ver_rota(rota_id));
CREATE POLICY "paragens_write_operador" ON public.paragens FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'operador')) WITH CHECK (public.has_role(auth.uid(),'operador'));

CREATE TABLE public.passageiros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  contacto text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.passageiros TO authenticated;
GRANT ALL ON public.passageiros TO service_role;
ALTER TABLE public.passageiros ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.viagens_passageiro (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rota_id uuid NOT NULL REFERENCES public.rotas(id) ON DELETE CASCADE,
  passageiro_id uuid NOT NULL REFERENCES public.passageiros(id) ON DELETE CASCADE,
  paragem_embarque_id uuid REFERENCES public.paragens(id) ON DELETE SET NULL,
  paragem_desembarque_id uuid REFERENCES public.paragens(id) ON DELETE SET NULL,
  estado public.estado_viagem NOT NULL DEFAULT 'pendente',
  token_qr text NOT NULL UNIQUE DEFAULT (gen_random_uuid()::text || '-' || encode(gen_random_bytes(16),'hex')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.viagens_passageiro TO authenticated;
GRANT ALL ON public.viagens_passageiro TO service_role;
ALTER TABLE public.viagens_passageiro ENABLE ROW LEVEL SECURITY;
CREATE POLICY "viagens_select" ON public.viagens_passageiro FOR SELECT TO authenticated USING (public.pode_ver_rota(rota_id));
CREATE POLICY "viagens_write_operador" ON public.viagens_passageiro FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'operador')) WITH CHECK (public.has_role(auth.uid(),'operador'));
CREATE POLICY "viagens_update_motorista" ON public.viagens_passageiro FOR UPDATE TO authenticated
USING (public.pode_ver_rota(rota_id)) WITH CHECK (public.pode_ver_rota(rota_id));

CREATE POLICY "passageiros_select" ON public.passageiros FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'operador') OR EXISTS (
  SELECT 1 FROM public.viagens_passageiro v JOIN public.rotas r ON r.id = v.rota_id
  WHERE v.passageiro_id = passageiros.id AND r.motorista_id = auth.uid()));
CREATE POLICY "passageiros_write_operador" ON public.passageiros FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'operador')) WITH CHECK (public.has_role(auth.uid(),'operador'));

CREATE TABLE public.registos_embarque (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viagem_passageiro_id uuid REFERENCES public.viagens_passageiro(id) ON DELETE CASCADE,
  rota_id uuid REFERENCES public.rotas(id) ON DELETE CASCADE,
  tipo public.tipo_registo NOT NULL,
  resultado public.resultado_registo NOT NULL,
  motivo_recusa text,
  registado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.registos_embarque TO authenticated;
GRANT ALL ON public.registos_embarque TO service_role;
ALTER TABLE public.registos_embarque ENABLE ROW LEVEL SECURITY;
CREATE POLICY "registos_select" ON public.registos_embarque FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'operador') OR registado_por = auth.uid());
CREATE POLICY "registos_insert" ON public.registos_embarque FOR INSERT TO authenticated
WITH CHECK (registado_por = auth.uid());

CREATE INDEX idx_paragens_rota ON public.paragens(rota_id, ordem);
CREATE INDEX idx_viagens_rota ON public.viagens_passageiro(rota_id);
CREATE INDEX idx_registos_viagem ON public.registos_embarque(viagem_passageiro_id);