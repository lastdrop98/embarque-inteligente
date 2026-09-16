import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Papel = "operador" | "motorista";

export function useSessao() {
  return useQuery({
    queryKey: ["sessao"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) return null;
      const { data: papeis } = await supabase
        .from("papeis_utilizador")
        .select("role")
        .eq("user_id", user.id);
      const papel = (papeis?.[0]?.role ?? "motorista") as Papel;
      return { user, papel };
    },
  });
}
