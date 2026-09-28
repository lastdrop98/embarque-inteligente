import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/*
 * "Remover do histórico" nunca apaga dados operacionais.
 * Apenas regista, por utilizador, que aquele item deixa de
 * aparecer na sua própria vista. Os registos reais continuam
 * disponíveis para auditoria.
 */

export type EntidadeHistorico = "viagem" | "pedido" | "rota" | "incidente" | "registo";

export function useHistoricoOcultos(userId: string | undefined) {
  const { data } = useQuery({
    queryKey: ["historico-ocultos", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("historico_ocultos")
        .select("entidade_tipo, entidade_id")
        .eq("user_id", userId!);
      if (error) throw error;
      return data;
    },
  });

  const ocultos = new Set((data ?? []).map((o) => `${o.entidade_tipo}:${o.entidade_id}`));

  return {
    ocultos,
    estaOculto: (tipo: EntidadeHistorico, id: string) => ocultos.has(`${tipo}:${id}`),
  };
}

export function useOcultarDoHistorico(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tipo, id }: { tipo: EntidadeHistorico; id: string }) => {
      if (!userId) throw new Error("Sessão não encontrada.");
      const { error } = await supabase
        .from("historico_ocultos")
        .insert({ user_id: userId, entidade_tipo: tipo, entidade_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removido da sua vista do histórico");
      qc.invalidateQueries({ queryKey: ["historico-ocultos", userId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
