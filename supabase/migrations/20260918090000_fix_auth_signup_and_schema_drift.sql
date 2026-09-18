-- ============================================================
-- EMBARQUE INTELIGENTE
-- CORREÇÃO DO REGISTO / AUTENTICAÇÃO / SCHEMA
-- ============================================================

-- ============================================================
-- 1. GARANTIR USER_ID DOS PASSAGEIROS
-- ============================================================

ALTER TABLE public.passageiros
  ADD COLUMN IF NOT EXISTS user_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS passageiros_user_id_unique
  ON public.passageiros(user_id)
  WHERE user_id IS NOT NULL;


-- ============================================================
-- 2. GARANTIR CAMPO TIPO DOS INCIDENTES
-- ============================================================

ALTER TABLE public.incidentes
  ADD COLUMN IF NOT EXISTS tipo text;


-- ============================================================
-- 3. RECRIAR FUNÇÃO DE CRIAÇÃO AUTOMÁTICA DO UTILIZADOR
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$

DECLARE
  _papel public.app_role;

BEGIN

  /*
   * Criar perfil principal.
   */

  INSERT INTO public.perfis (
    id,
    nome,
    email
  )

  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'nome',
      ''
    ),
    COALESCE(
      NEW.email,
      ''
    )
  )

  ON CONFLICT (id)
  DO NOTHING;


  /*
   * Determinar o papel.
   *
   * O utilizador público só pode criar:
   *
   * motorista
   * passageiro
   *
   * Qualquer outro valor é convertido
   * automaticamente para passageiro.
   *
   * Portanto:
   *
   * operador -> passageiro
   * admin    -> passageiro
   */

  _papel := CASE
    COALESCE(
      NEW.raw_user_meta_data->>'papel',
      'passageiro'
    )

    WHEN 'motorista'
      THEN 'motorista'::public.app_role

    WHEN 'passageiro'
      THEN 'passageiro'::public.app_role

    ELSE
      'passageiro'::public.app_role

  END;


  /*
   * Criar papel do utilizador.
   */

  INSERT INTO public.papeis_utilizador (
    user_id,
    role
  )

  VALUES (
    NEW.id,
    _papel
  )

  ON CONFLICT DO NOTHING;


  /*
   * Se for passageiro,
   * criar também o registo na tabela passageiros.
   */

  IF _papel = 'passageiro' THEN

    INSERT INTO public.passageiros (
      nome,
      contacto,
      user_id
    )

    VALUES (
      COALESCE(
        NULLIF(
          NEW.raw_user_meta_data->>'nome',
          ''
        ),
        'Passageiro'
      ),

      COALESCE(
        NEW.email,
        ''
      ),

      NEW.id
    )

    ON CONFLICT DO NOTHING;

  END IF;


  RETURN NEW;

END;

$$;


-- ============================================================
-- 4. RECRIAR TRIGGER DE NOVOS UTILIZADORES
-- ============================================================

DROP TRIGGER IF EXISTS on_auth_user_created
ON auth.users;


CREATE TRIGGER on_auth_user_created

AFTER INSERT
ON auth.users

FOR EACH ROW

EXECUTE FUNCTION public.handle_new_user();


-- ============================================================
-- 5. SEGURANÇA DA FUNÇÃO
-- ============================================================

REVOKE ALL
ON FUNCTION public.handle_new_user()
FROM PUBLIC, anon, authenticated;


-- ============================================================
-- 6. SEGURANÇA DA FUNÇÃO has_role
-- ============================================================

REVOKE ALL
ON FUNCTION public.has_role(uuid, public.app_role)
FROM PUBLIC, anon;


GRANT EXECUTE
ON FUNCTION public.has_role(uuid, public.app_role)
TO authenticated;
