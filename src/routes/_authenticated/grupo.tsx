import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSessao } from "@/lib/useSessao";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/grupo")({
  head: () => ({
    meta: [
      { title: "Responsável de Grupo — PickApp Mobility" },
      { name: "description", content: "Área do Responsável de Grupo no PickApp Mobility." },
    ],
  }),
  component: GrupoPage,
});

function GrupoPage() {
  const { data: sessao } = useSessao();

  const { data: pedidos } = useQuery({
    queryKey: ["pedidos-responsavel-grupo", sessao?.user.id],
    enabled: !!sessao?.user.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos_transporte")
        .select("id, titulo, data_viagem, origem, destino, estado, passageiro_id, passageiros(nome)")
        .eq("criado_por", sessao!.user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Responsável de Grupo</h1>
        <p className="text-sm text-muted-foreground">
          Área destinada à gestão das solicitações do seu grupo.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>Pedidos do grupo</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {pedidos?.length ? pedidos.map((p) => (
            <div key={p.id} className="rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">
                  {(p.passageiros as { nome: string } | null)?.nome ?? p.titulo}
                </span>
                <span className="rounded-md border px-2 py-1 text-xs">{p.estado}</span>
              </div>
              <p className="mt-1 text-muted-foreground">
                {p.data_viagem} · {p.origem} → {p.destino}
              </p>
            </div>
          )) : (
            <p className="text-sm text-muted-foreground">
              Ainda não existem solicitações criadas por este responsável.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
