import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Passageiro = {
  id: string;
  nome: string;
  categoria: Database["public"]["Enums"]["categoria_passageiro"];
};

const ESTADOS_PEDIDO: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  rascunho: { label: "Rascunho", variant: "outline" },
  submetido: { label: "Submetido", variant: "secondary" },
  em_analise: { label: "Em análise", variant: "default" },
  aprovado: { label: "Aprovado", variant: "default" },
  alocado: { label: "Alocado", variant: "default" },
  agendado: { label: "Agendado", variant: "default" },
  rejeitado: { label: "Rejeitado", variant: "destructive" },
  cancelado: { label: "Cancelado", variant: "outline" },
};

const ESTADOS_ACTIVOS = ["rascunho", "submetido", "em_analise", "aprovado", "alocado", "agendado"];

export function PassageiroPedidos({
  passageiro,
  userId,
}: {
  passageiro: Passageiro;
  userId: string;
}) {
  const qc = useQueryClient();
  const hoje = new Date().toISOString().slice(0, 10);

  const [dataViagem, setDataViagem] = useState(hoje);
  const [origemId, setOrigemId] = useState("");
  const [destinoId, setDestinoId] = useState("");

  const { data: pontos = [] } = useQuery({
    queryKey: ["pontos-predefinidos-passageiro"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pontos_predefinidos")
        .select("id, nome")
        .eq("activo", true)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: pedidos = [], isLoading: aCarregarPedidos } = useQuery({
    queryKey: ["meus-pedidos-transporte", passageiro.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos_transporte")
        .select("id, titulo, data_viagem, hora, origem, destino, num_passageiros, tipo_viatura, observacoes, estado, rota_id, created_at")
        .eq("passageiro_id", passageiro.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const pedidoActivo = pedidos.find((p) => ESTADOS_ACTIVOS.includes(p.estado));

  const criarPedido = useMutation({
    mutationFn: async () => {
      if (pedidoActivo) throw new Error("Já existe um pedido activo. Cancele-o ou aguarde a conclusão antes de criar outro.");
      if (!origemId || !destinoId) throw new Error("Seleccione a origem e o destino.");
      if (origemId === destinoId) throw new Error("A origem e o destino devem ser diferentes.");

      const origem = pontos.find((p) => p.id === origemId);
      const destino = pontos.find((p) => p.id === destinoId);
      if (!origem || !destino) throw new Error("Os pontos seleccionados já não estão disponíveis.");

      const { data, error } = await supabase
        .from("pedidos_transporte")
        .insert({
          titulo: `Pedido de transporte — ${dataViagem}`,
          data_viagem: dataViagem,
          hora: null,
          origem: origem.nome,
          destino: destino.nome,
          num_passageiros: 1,
          tipo_viatura: null,
          observacoes: null,
          categoria: passageiro.categoria,
          passageiro_id: passageiro.id,
          criado_por: userId,
          estado: "submetido",
        })
        .select("id")
        .single();

      if (error) throw error;

      try {
        const { error: notifError } = await supabase.rpc("notificar_novo_pedido", {
          _pedido_id: data.id,
        });
        if (notifError) console.error(notifError);
      } catch (e) {
        console.error(e);
      }
    },
    onSuccess: () => {
      toast.success("Pedido de transporte enviado");
      setOrigemId("");
      setDestinoId("");
      qc.invalidateQueries({ queryKey: ["meus-pedidos-transporte", passageiro.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelar = useMutation({
    mutationFn: async (pedidoId: string) => {
      const { error } = await supabase.rpc("cancelar_pedido", { _pedido_id: pedidoId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pedido cancelado");
      qc.invalidateQueries({ queryKey: ["meus-pedidos-transporte", passageiro.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const eliminar = useMutation({
    mutationFn: async (pedidoId: string) => {
      const { error } = await supabase.rpc("eliminar_pedido", { _pedido_id: pedidoId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pedido eliminado");
      qc.invalidateQueries({ queryKey: ["meus-pedidos-transporte", passageiro.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const podeEnviar =
    dataViagem >= hoje &&
    !!origemId &&
    !!destinoId &&
    origemId !== destinoId &&
    !pedidoActivo &&
    !criarPedido.isPending;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Solicitar transporte</CardTitle>
          <p className="text-sm text-muted-foreground">
            Escolha a data, o ponto de origem e o destino. Só pode existir um pedido activo de cada vez.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Data da viagem</Label>
            <input
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              type="date"
              min={hoje}
              value={dataViagem}
              onChange={(e) => setDataViagem(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Ponto de origem</Label>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={origemId}
                onChange={(e) => setOrigemId(e.target.value)}
                disabled={!pontos.length || !!pedidoActivo}
              >
                <option value="">Seleccione...</option>
                {pontos.map((p) => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Destino</Label>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={destinoId}
                onChange={(e) => setDestinoId(e.target.value)}
                disabled={!pontos.length || !!pedidoActivo}
              >
                <option value="">Seleccione...</option>
                {pontos.map((p) => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>
            </div>
          </div>

          <Button disabled={!podeEnviar} onClick={() => criarPedido.mutate()}>
            {criarPedido.isPending ? "A enviar..." : "Enviar pedido"}
          </Button>

          {pedidoActivo && (
            <p className="text-sm font-medium text-amber-700">
              Já existe um pedido activo. Pode cancelá-lo abaixo para fazer uma nova solicitação.
            </p>
          )}

          {!pontos.length && (
            <p className="text-sm text-destructive">
              Ainda não existem pontos predefinidos activos. O administrador precisa de os configurar.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Os meus pedidos</CardTitle>
          <p className="text-sm text-muted-foreground">
            Histórico e estado das solicitações.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {aCarregarPedidos ? (
            <p className="text-sm text-muted-foreground">A carregar pedidos...</p>
          ) : pedidos.length ? (
            pedidos.map((pedido) => {
              const estado = ESTADOS_PEDIDO[pedido.estado] ?? {
                label: pedido.estado,
                variant: "outline" as const,
              };
              const podeCancelar = ESTADOS_ACTIVOS.includes(pedido.estado);
              const podeEliminar = ["rascunho", "submetido", "cancelado", "rejeitado"].includes(pedido.estado);
              return (
                <div key={pedido.id} className="rounded-lg border bg-card/80 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{pedido.titulo}</p>
                      <p className="text-xs text-muted-foreground">
                        {pedido.data_viagem}
                      </p>
                    </div>
                    <Badge variant={estado.variant}>{estado.label}</Badge>
                  </div>
                  <p className="mt-2 text-sm">{pedido.origem} → {pedido.destino}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {podeCancelar && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={cancelar.isPending}
                        onClick={() => cancelar.mutate(pedido.id)}
                      >
                        Cancelar
                      </Button>
                    )}
                    {podeEliminar && (
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={eliminar.isPending}
                        onClick={() => eliminar.mutate(pedido.id)}
                      >
                        Eliminar
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <p className="font-medium">Ainda não tem pedidos</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Faça uma solicitação para começar.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
