import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type EstadoPedido = Database["public"]["Enums"]["estado_pedido"];

const ESTADOS: Record<string, string> = {
  rascunho: "Rascunho",
  submetido: "Submetido",
  em_analise: "Em análise",
  aprovado: "Aprovado",
  alocado: "Alocado",
  agendado: "Agendado",
  rejeitado: "Rejeitado",
};

const PROXIMOS: Record<string, EstadoPedido[]> = {
  submetido: ["em_analise", "rejeitado"],
  em_analise: ["aprovado", "rejeitado"],
  aprovado: ["alocado"],
  alocado: ["agendado"],
  agendado: [],
  rejeitado: [],
  rascunho: ["submetido"],
};

type Pedido = {
  id: string;
  titulo: string;
  data_viagem: string;
  hora: string | null;
  origem: string;
  destino: string;
  num_passageiros: number;
  tipo_viatura: string | null;
  observacoes: string | null;
  estado: EstadoPedido;
  rota_id: string | null;
  created_at: string;
  passageiros: { nome: string; contacto: string } | null;
};

export function PedidosOperador() {
  const qc = useQueryClient();
  const [rotaPorPedido, setRotaPorPedido] = useState<Record<string, string>>({});

  const { data: pedidos, isLoading, error } = useQuery({
    queryKey: ["pedidos-operador"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos_transporte")
        .select("id, titulo, data_viagem, hora, origem, destino, num_passageiros, tipo_viatura, observacoes, estado, rota_id, created_at, passageiros(nome, contacto)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Pedido[];
    },
  });

  const { data: rotas } = useQuery({
    queryKey: ["rotas-para-pedidos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rotas")
        .select("id, nome, estado, hora_inicio, hora_fim")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const rotaPorId = new Map((rotas ?? []).map((rota) => [rota.id, rota]));

  const alterarEstado = useMutation({
    mutationFn: async ({ id, estado }: { id: string; estado: EstadoPedido }) => {
      const { error } = await supabase
        .from("pedidos_transporte")
        .update({ estado })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Estado do pedido actualizado");
      qc.invalidateQueries({ queryKey: ["pedidos-operador"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const alocar = useMutation({
    mutationFn: async ({ id, rotaId }: { id: string; rotaId: string }) => {
      const { error } = await supabase
        .from("pedidos_transporte")
        .update({ rota_id: rotaId, estado: "alocado" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pedido alocado à rota");
      qc.invalidateQueries({ queryKey: ["pedidos-operador"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Pedidos de transporte</CardTitle>
          <p className="text-sm text-muted-foreground">
            Pedidos enviados pelos passageiros para análise, aprovação e alocação.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && <p className="text-sm text-muted-foreground">A carregar pedidos...</p>}
          {error && <p className="text-sm text-destructive">Não foi possível carregar os pedidos: {(error as Error).message}</p>}
          {!isLoading && !error && !pedidos?.length && (
            <p className="text-sm text-muted-foreground">Ainda não existem pedidos.</p>
          )}

          {pedidos?.map((pedido) => {
            const proximos = PROXIMOS[pedido.estado] ?? [];
            const rotaSelecionada = rotaPorPedido[pedido.id] ?? pedido.rota_id ?? "";
            const rota = pedido.rota_id ? rotaPorId.get(pedido.rota_id) : null;

            return (
              <div key={pedido.id} className="space-y-3 rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{pedido.titulo}</p>
                    <p className="text-sm text-muted-foreground">
                      {pedido.passageiros?.nome ?? "Passageiro"}{pedido.passageiros?.contacto ? ` · ${pedido.passageiros.contacto}` : ""}
                    </p>
                  </div>
                  <Badge variant={pedido.estado === "rejeitado" ? "destructive" : pedido.estado === "aprovado" || pedido.estado === "alocado" ? "default" : "secondary"}>
                    {ESTADOS[pedido.estado] ?? pedido.estado}
                  </Badge>
                </div>

                <div className="grid gap-2 text-sm md:grid-cols-4">
                  <div><span className="text-muted-foreground">Data:</span> {pedido.data_viagem}{pedido.hora ? ` · ${pedido.hora.slice(0, 5)}` : ""}</div>
                  <div><span className="text-muted-foreground">Origem:</span> {pedido.origem}</div>
                  <div><span className="text-muted-foreground">Destino:</span> {pedido.destino}</div>
                  <div><span className="text-muted-foreground">Passageiros:</span> {pedido.num_passageiros}</div>
                </div>

                {pedido.tipo_viatura && <p className="text-sm"><span className="text-muted-foreground">Viatura:</span> {pedido.tipo_viatura}</p>}
                {pedido.observacoes && <p className="text-sm"><span className="text-muted-foreground">Observações:</span> {pedido.observacoes}</p>}
                {pedido.rota_id && <p className="text-sm"><span className="text-muted-foreground">Rota:</span> {rota?.nome ?? pedido.rota_id}</p>}

                <div className="flex flex-wrap items-end gap-3 border-t pt-3">
                  {pedido.estado === "aprovado" && (
                    <div className="min-w-[240px] space-y-2">
                      <Label>Alocar à rota</Label>
                      <select
                        className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                        value={rotaSelecionada}
                        onChange={(e) => setRotaPorPedido((prev) => ({ ...prev, [pedido.id]: e.target.value }))}
                      >
                        <option value="">— seleccionar rota —</option>
                        {rotas?.filter((r) => !["concluida", "cancelada"].includes(r.estado)).map((r) => (
                          <option key={r.id} value={r.id}>{r.nome} · {ESTADOS[r.estado] ?? r.estado}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {pedido.estado === "aprovado" && (
                    <Button
                      size="sm"
                      disabled={!rotaSelecionada || alocar.isPending}
                      onClick={() => alocar.mutate({ id: pedido.id, rotaId: rotaSelecionada })}
                    >
                      Alocar pedido
                    </Button>
                  )}

                  {proximos.filter((estado) => !(pedido.estado === "aprovado" && estado === "alocado")).map((estado) => (
                    <Button
                      key={estado}
                      size="sm"
                      variant={estado === "rejeitado" ? "destructive" : "outline"}
                      disabled={alterarEstado.isPending}
                      onClick={() => alterarEstado.mutate({ id: pedido.id, estado })}
                    >
                      {ESTADOS[estado]}
                    </Button>
                  ))}

                  {pedido.estado === "alocado" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={alterarEstado.isPending}
                      onClick={() => alterarEstado.mutate({ id: pedido.id, estado: "agendado" })}
                    >
                      Marcar como agendado
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
