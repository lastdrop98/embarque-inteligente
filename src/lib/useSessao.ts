import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Papel =
  | "admin"
  | "operador"
  | "motorista"
  | "passageiro";

export type Sessao = {
  user: NonNullable<
    Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"]
  >;
  papeis: Papel[];
  perfil: {
    nome: string;
    email: string;
    activo: boolean;
  } | null;
  activo: boolean;
};

export function useSessao() {
  return useQuery({
    queryKey: ["sessao"],
    queryFn: async (): Promise<Sessao | null> => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      if (!user) {
        return null;
      }

      const [{ data: papeis, error: papeisError }, { data: perfil, error: perfilError }] =
        await Promise.all([
          supabase
            .from("papeis_utilizador")
            .select("role")
            .eq("user_id", user.id),

          supabase
            .from("perfis")
            .select("nome, email, activo")
            .eq("id", user.id)
            .maybeSingle(),
        ]);

      if (papeisError) {
        throw papeisError;
      }

      if (perfilError) {
        throw perfilError;
      }

      const lista = (papeis ?? [])
        .map((p) => p.role as Papel)
        .filter((role): role is Papel =>
          ["admin", "operador", "motorista", "passageiro"].includes(role)
        );

      return {
        user,
        papeis: [...new Set(lista)],
        perfil,
        activo: perfil?.activo ?? true,
      };
    },
  });
}
