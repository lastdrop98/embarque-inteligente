import postgres from "postgres";

let repairPromise: Promise<void> | undefined;

const SQL = "-- Embarque Inteligente: reparação directa e idempotente do contrato crítico do Lovable Cloud.\n-- Este ficheiro é executado pelo processo server/build quando existe uma connection string PostgreSQL.\n-- Não apaga dados.\n\nALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'responsavel_grupo';\n-- SPLIT_AFTER_ENUM\n\nCREATE TABLE IF NOT EXISTS public.pontos_predefinidos (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  nome text NOT NULL,\n  activo boolean NOT NULL DEFAULT true,\n  created_at timestamptz NOT NULL DEFAULT now()\n);\n\nCREATE UNIQUE INDEX IF NOT EXISTS ux_pontos_predefinidos_nome\n  ON public.pontos_predefinidos (lower(trim(nome)));\n\nALTER TABLE public.rotas\n  ADD COLUMN IF NOT EXISTS ponto_partida_id uuid REFERENCES public.pontos_predefinidos(id) ON DELETE RESTRICT,\n  ADD COLUMN IF NOT EXISTS ponto_chegada_id uuid REFERENCES public.pontos_predefinidos(id) ON DELETE RESTRICT,\n  ADD COLUMN IF NOT EXISTS paragem_id uuid REFERENCES public.pontos_predefinidos(id) ON DELETE RESTRICT;\n\nALTER TABLE public.pontos_predefinidos ENABLE ROW LEVEL SECURITY;\n\nDROP POLICY IF EXISTS pontos_predefinidos_select ON public.pontos_predefinidos;\nCREATE POLICY pontos_predefinidos_select\nON public.pontos_predefinidos\nFOR SELECT TO authenticated\nUSING (auth.uid() IS NOT NULL);\n\nDROP POLICY IF EXISTS pontos_predefinidos_admin_insert ON public.pontos_predefinidos;\nCREATE POLICY pontos_predefinidos_admin_insert\nON public.pontos_predefinidos\nFOR INSERT TO authenticated\nWITH CHECK (public.has_role(auth.uid(), 'admin'));\n\nDROP POLICY IF EXISTS pontos_predefinidos_admin_update ON public.pontos_predefinidos;\nCREATE POLICY pontos_predefinidos_admin_update\nON public.pontos_predefinidos\nFOR UPDATE TO authenticated\nUSING (public.has_role(auth.uid(), 'admin'))\nWITH CHECK (public.has_role(auth.uid(), 'admin'));\n\nDROP POLICY IF EXISTS pontos_predefinidos_admin_delete ON public.pontos_predefinidos;\nCREATE POLICY pontos_predefinidos_admin_delete\nON public.pontos_predefinidos\nFOR DELETE TO authenticated\nUSING (public.has_role(auth.uid(), 'admin'));\n\n-- O Admin precisa de poder gerir papéis através do painel.\nALTER TABLE public.papeis_utilizador ENABLE ROW LEVEL SECURITY;\nDROP POLICY IF EXISTS papeis_admin_manage ON public.papeis_utilizador;\nCREATE POLICY papeis_admin_manage\nON public.papeis_utilizador\nFOR ALL TO authenticated\nUSING (public.has_role(auth.uid(), 'admin'))\nWITH CHECK (public.has_role(auth.uid(), 'admin'));\n\nCREATE OR REPLACE FUNCTION public.criar_rota_operacional(\n  _nome text DEFAULT NULL,\n  _veiculo_id uuid DEFAULT NULL,\n  _motorista_id uuid DEFAULT NULL,\n  _ponto_partida_id uuid DEFAULT NULL,\n  _ponto_chegada_id uuid DEFAULT NULL,\n  _paragem_id uuid DEFAULT NULL,\n  _hora_inicio time DEFAULT NULL,\n  _hora_fim time DEFAULT NULL,\n  _passageiros_previstos integer DEFAULT NULL\n)\nRETURNS uuid\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = public\nAS $function$\nDECLARE\n  _rota_id uuid;\n  _nome_partida text;\n  _nome_chegada text;\n  _nome_paragem text;\nBEGIN\n  IF auth.uid() IS NULL OR (\n    NOT public.has_role(auth.uid(), 'admin')\n    AND NOT public.has_role(auth.uid(), 'operador')\n  ) THEN\n    RAISE EXCEPTION 'Sem permissão para criar uma rota';\n  END IF;\n\n  IF _ponto_partida_id IS NULL OR _ponto_chegada_id IS NULL THEN\n    RAISE EXCEPTION 'A rota deve ter ponto de partida e ponto de chegada';\n  END IF;\n\n  IF _ponto_partida_id = _ponto_chegada_id THEN\n    RAISE EXCEPTION 'O ponto de partida e o ponto de chegada devem ser diferentes';\n  END IF;\n\n  IF _paragem_id IS NOT NULL\n     AND (_paragem_id = _ponto_partida_id OR _paragem_id = _ponto_chegada_id) THEN\n    RAISE EXCEPTION 'A paragem intermédia deve ser diferente da partida e da chegada';\n  END IF;\n\n  SELECT nome INTO _nome_partida\n  FROM public.pontos_predefinidos\n  WHERE id = _ponto_partida_id AND activo = true;\n\n  SELECT nome INTO _nome_chegada\n  FROM public.pontos_predefinidos\n  WHERE id = _ponto_chegada_id AND activo = true;\n\n  IF _nome_partida IS NULL OR _nome_chegada IS NULL THEN\n    RAISE EXCEPTION 'O ponto de partida ou chegada não está disponível';\n  END IF;\n\n  IF _paragem_id IS NOT NULL THEN\n    SELECT nome INTO _nome_paragem\n    FROM public.pontos_predefinidos\n    WHERE id = _paragem_id AND activo = true;\n\n    IF _nome_paragem IS NULL THEN\n      RAISE EXCEPTION 'A paragem intermédia não está disponível';\n    END IF;\n  END IF;\n\n  INSERT INTO public.rotas (\n    nome, veiculo_id, motorista_id, hora_inicio, hora_fim,\n    passageiros_previstos, ponto_partida_id, ponto_chegada_id, paragem_id, estado\n  )\n  VALUES (\n    COALESCE(NULLIF(trim(_nome), ''), _nome_partida || ' → ' || _nome_chegada),\n    _veiculo_id, _motorista_id, _hora_inicio, _hora_fim,\n    _passageiros_previstos, _ponto_partida_id, _ponto_chegada_id, _paragem_id, 'rascunho'\n  )\n  RETURNING id INTO _rota_id;\n\n  INSERT INTO public.paragens (rota_id, nome, ordem, hora_prevista)\n  VALUES (_rota_id, _nome_partida, 1, _hora_inicio);\n\n  IF _paragem_id IS NOT NULL THEN\n    INSERT INTO public.paragens (rota_id, nome, ordem, hora_prevista)\n    VALUES (_rota_id, _nome_paragem, 2, NULL);\n  END IF;\n\n  INSERT INTO public.paragens (rota_id, nome, ordem, hora_prevista)\n  VALUES (\n    _rota_id,\n    _nome_chegada,\n    CASE WHEN _paragem_id IS NULL THEN 2 ELSE 3 END,\n    _hora_fim\n  );\n\n  RETURN _rota_id;\nEND;\n$function$;\n\nREVOKE ALL ON FUNCTION public.criar_rota_operacional(text, uuid, uuid, uuid, uuid, uuid, time, time, integer)\nFROM PUBLIC, anon;\nGRANT EXECUTE ON FUNCTION public.criar_rota_operacional(text, uuid, uuid, uuid, uuid, uuid, time, time, integer)\nTO authenticated;\n\nNOTIFY pgrst, 'reload schema';";
const candidates = () =>
  [
    process.env.LOVABLE_DB_MIGRATION_URL,
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL_NON_POOLING,
    process.env.POSTGRES_URL,
    process.env.SUPABASE_DB_URL,
    process.env.SUPABASE_DB_CONNECTION_STRING,
  ].filter(Boolean) as string[];

export function ensureCloudDatabaseRepair(): Promise<void> {
  if (repairPromise) return repairPromise;

  repairPromise = (async () => {
    const urls = candidates();
    if (!urls.length) {
      console.log("[db] No direct PostgreSQL connection string available at runtime; skipping repair.");
      return;
    }

const [enumStatement, remainingSql] = SQL.split("\n-- SPLIT_AFTER_ENUM\n");\n    const statements = [enumStatement, remainingSql].filter(Boolean);
    let lastError: unknown;

    for (const url of urls) {
      let sql: ReturnType<typeof postgres> | undefined;
      try {
        console.log("[db] Running idempotent Cloud database repair...");
        sql = postgres(url, { max: 1, connect_timeout: 8, idle_timeout: 5 });
        for (const statement of statements) {
          await sql.unsafe(statement);
        }
        await sql.end();
        console.log("[db] Cloud database repair completed successfully.");
        return;
      } catch (error) {
        lastError = error;
        console.error("[db] Cloud repair candidate failed:", error instanceof Error ? error.message : error);
        try {
          await sql?.end({ timeout: 1 });
        } catch {}
      }
    }

    console.error("[db] Cloud database repair was not applied.", lastError);
  })();

  return repairPromise;
}
