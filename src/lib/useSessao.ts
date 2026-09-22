import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Papel =
  | "admin"
  | "operador"
  | "motorista"
  | "passageiro" | "responsavel_grupo";

export type Sessao = {
  user: NonNullable<
    Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"]
  >;
  papeis: Papel[];
  papel: Papel | null;
  perfil: {
    nome: string;
    email: string;
    activo: boolean;
  } | null;
  activo: boolean;
};

const PAPEIS_VALIDOS: Papel[] = [
  "admin",
  "operador",
  "motorista",
  "passageiro",
  "responsavel_grupo",
];

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

      const [
        { data: papeis, error: papeisError },
        { data: perfil, error: perfilError },
      ] = await Promise.all([
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
          PAPEIS_VALIDOS.includes(role)
        );

      const papeisUnicos = [
        ...new Set(lista),
      ];

      /*
       * O papel da sessão só é considerado quando
       * estiver realmente atribuído ao utilizador.
       *
       * Para contas com apenas um papel, esse papel
       * é usado automaticamente.
       *
       * Para contas com vários papéis, o utilizador
       * escolhe através de sessionStorage.
       */
      let papel: Papel | null = null;

      if (papeisUnicos.length === 1) {
        papel = papeisUnicos[0] ?? null;
      } else if (papeisUnicos.length > 1) {
        const armazenado =
          sessionStorage.getItem("papel_sessao");

        if (
          armazenado &&
          PAPEIS_VALIDOS.includes(
            armazenado as Papel
          ) &&
          papeisUnicos.includes(
            armazenado as Papel
          )
        ) {
          papel = armazenado as Papel;
        }
      }

      return {
        user,
        papeis: papeisUnicos,
        papel,
        perfil,
        activo: perfil?.activo ?? true,
      };
    },
  });
}
