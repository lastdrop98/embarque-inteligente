import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Papel = "admin" | "operador" | "motorista" | "passageiro";

export function useSessao() {
  return useQuery({
    queryKey: ["sessao"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) return null;
      const [{ data: papeis }, { data: perfil }] = await Promise.all([
        supabase.from("papeis_utilizador").select("role").eq("user_id", user.id),
        supabase.from("perfis").select("nome, email, activo").eq("id", user.id).maybeSingle(),
      ]);
      const lista = (papeis ?? []).map((p) => p.role as Papel);
      const papel: Papel = lista.includes("admin")
        ? "admin"
        : ((lista[0] ?? "motorista") as Papel);
      return { user, papel, papeis: lista, perfil, activo: perfil?.activo ?? true };
    },
  });
}
