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
  cancelado: "Cancelado",
};

const ESTADOS_ROTA: Record<string, string> = {
  rascunho: "Rascunho",
  agendada: "Agendada",
  embarque_aberto: "Embarque aberto",
  embarque_fechado: "Embarque fechado",
  em_curso: "Em curso",
  concluida: "Concluída",
  cancelada: "Cancelada",
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

type Paragem = { id: string; nome: string; ordem: number; hora_prevista: string | null };
type Rota = { id: string; nome: string; estado: string; hora_inicio: string | null; hora_fim: string | null; paragens: Paragem[] };

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
  passageiro_id: string | null;
  passageiros: { nome: string; contacto: string } | null;
};

const normalizar = (valor: string) =>
  valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

export function PedidosOperador() {
  const qc = useQueryClient();
  const [rotaPorPedido, setRotaPorPedido] = useState<Record<string, string>>({});
  const [embarquePorPedido, setEmbarquePorPedido] = useState<Record<string, string>>({});
  const [desembarquePorPedido, setDesembarquePorPedido] = useState<Record<string, string>>({});

  const { data: pedidos, isLoading, error } = useQuery({
    queryKey: ["pedidos-operador"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos_transporte")
        .select("id, titulo, data_viagem, hora, origem, destino, num_passageiros, tipo_viatura, observacoes, estado, rota_id, created_at, passageiro_id, passageiros(nome, contacto)")
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
        .select("id, nome, estado, hora_inicio, hora_fim, paragens(id, nome, ordem, hora_prevista)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Rota[];
    },
  });

  const rotaPorId = new Map((rotas ?? []).map((rota) => [rota.id, rota]));

  const prepararParagens = (pedido: Pedido, rota: Rota) => {
    const paragens = [...(rota.paragens ?? [])].sort((a, b) => a.ordem - b.ordem);
    const origemNormalizada = normalizar(pedido.origem);
    const destinoNormalizado = normalizar(pedido.destino);
    const origemEncontrada =
      paragens.find((p) => normalizar(p.nome) === origemNormalizada) ??
      paragens.find((p) => normalizar(p.nome).includes(origemNormalizada) || origemNormalizada.includes(normalizar(p.nome)));
    const destinoEncontrado =
      paragens.find((p) => normalizar(p.nome) === destinoNormalizado) ??
      paragens.find((p) => normalizar(p.nome).includes(destinoNormalizado) || destinoNormalizado.includes(normalizar(p.nome)));
    if (origemEncontrada) setEmbarquePorPedido((prev) => ({ ...prev, [pedido.id]: origemEncontrada.id }));
    if (destinoEncontrado) setDesembarquePorPedido((prev) => ({ ...prev, [pedido.id]: destinoEncontrado.id }));
  };

  const alterarEstado = useMutation({
    mutationFn: async ({ id, estado }: { id: string; estado: EstadoPedido }) => {
      const { error } = await supabase.from("pedidos_transporte").update({ estado }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Estado do pedido actualizado");
      qc.invalidateQueries({ queryKey: ["pedidos-operador"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const editarPedido = useMutation({
    mutationFn: async ({ id, campos }: { id: string; campos: Record<string, unknown> }) => {
      const { error } = await supabase.from("pedidos_transporte").update(campos as Database["public"]["Tables"]["pedidos_transporte"]["Update"]).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pedido actualizado");
      qc.invalidateQueries({ queryKey: ["pedidos-operador"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelarPedido = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("cancelar_pedido", { _pedido_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pedido cancelado");
      qc.invalidateQueries({ queryKey: ["pedidos-operador"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const eliminarPedido = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("eliminar_pedido", { _pedido_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pedido eliminado");
      qc.invalidateQueries({ queryKey: ["pedidos-operador"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const editar = (p: Pedido) => {
    const titulo = window.prompt("Título", p.titulo ?? "");
    if (titulo === null) return;
    const origem = window.prompt("Origem", p.origem);
    if (origem === null) return;
    const destino = window.prompt("Destino", p.destino);
    if (destino === null) return;
    const data = window.prompt("Data da viagem (AAAA-MM-DD)", p.data_viagem);
    if (data === null) return;
    const hora = window.prompt("Hora (HH:MM, opcional)", p.hora?.slice(0, 5) ?? "");
    if (hora === null) return;
    const numero = window.prompt("Número de passageiros", String(p.num_passageiros));
    if (numero === null) return;
    editarPedido.mutate({
      id: p.id,
      campos: {
        titulo: titulo.trim(),
        origem: origem.trim(),
        destino: destino.trim(),
        data_viagem: data,
        hora: hora.trim() || null,
        num_passageiros: Math.max(1, Number(numero) || 1),
      },
    });
  };

  const alocar = useMutation({
    mutationFn: async ({ pedido, rotaId, embarqueId, desembarqueId }: {
      pedido: Pedido;
      rotaId: string;
      embarqueId: string;
      desembarqueId: string;
    }) => {
      if (!pedido.passageiro_id) throw new Error("O pedido não tem um passageiro associado.");

      // Cada pedido aprovado/alocado representa uma viagem própria.
      // Não reutilizamos uma viagem anterior do mesmo passageiro na mesma rota:
      // cada nova solicitação deve gerar um novo bilhete QR.
      const { error: viagemError } = await supabase.from("viagens_passageiro").insert({
        rota_id: rotaId,
        passageiro_id: pedido.passageiro_id,
        paragem_embarque_id: embarqueId,
        paragem_desembarque_id: desembarqueId,
      });
      if (viagemError) throw viagemError;

      const { error: pedidoError } = await supabase
        .from("pedidos_transporte")
        .update({ rota_id: rotaId, estado: "alocado" })
        .eq("id", pedido.id);
      if (pedidoError) throw pedidoError;
    },
    onSuccess: () => {
      toast.success("Pedido alocado e bilhete QR gerado");
      qc.invalidateQueries({ queryKey: ["pedidos-operador"] });
      qc.invalidateQueries({ queryKey: ["viagens"] });
      qc.invalidateQueries({ queryKey: ["reconciliacao"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Pedidos de transporte</CardTitle>
          <p className="text-sm text-muted-foreground">Pedidos enviados pelos passageiros para análise, aprovação e alocação.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && <p className="text-sm text-muted-foreground">A carregar pedidos...</p>}
          {error && <p className="text-sm text-destructive">Não foi possível carregar os pedidos: {(error as Error).message}</p>}
          {!isLoading && !error && !pedidos?.length && <p className="text-sm text-muted-foreground">Ainda não existem pedidos.</p>}

          {pedidos?.map((pedido) => {
            const proximos = PROXIMOS[pedido.estado] ?? [];
            const rotaSelecionada = rotaPorPedido[pedido.id] ?? pedido.rota_id ?? "";
            const rota = pedido.rota_id ? rotaPorId.get(pedido.rota_id) : null;
            const embarqueSelecionado = embarquePorPedido[pedido.id] ?? "";
            const desembarqueSelecionado = desembarquePorPedido[pedido.id] ?? "";

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
                    <>
                      <div className="min-w-[240px] space-y-2">
                        <Label>Alocar à rota</Label>
                        <select
                          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                          value={rotaSelecionada}
                          onChange={(e) => {
                            const novaRotaId = e.target.value;
                            setRotaPorPedido((prev) => ({ ...prev, [pedido.id]: novaRotaId }));
                            setEmbarquePorPedido((prev) => ({ ...prev, [pedido.id]: "" }));
                            setDesembarquePorPedido((prev) => ({ ...prev, [pedido.id]: "" }));
                            if (novaRotaId) {
                              const novaRota = rotaPorId.get(novaRotaId);
                              if (novaRota) prepararParagens(pedido, novaRota);
                            }
                          }}
                        >
                          <option value="">— seleccionar rota —</option>
                          {rotas?.filter((r) => !["concluida", "cancelada"].includes(r.estado)).map((r) => (
                            <option key={r.id} value={r.id}>{r.nome} · {ESTADOS_ROTA[r.estado] ?? r.estado}</option>
                          ))}
                        </select>
                      </div>

                      {rotaSelecionada && (
                        <>
                          <div className="min-w-[220px] space-y-2">
                            <Label>Embarque</Label>
                            <select
                              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                              value={embarqueSelecionado}
                              onChange={(e) => setEmbarquePorPedido((prev) => ({ ...prev, [pedido.id]: e.target.value }))}
                            >
                              <option value="">— seleccionar paragem —</option>
                              {[...(rotaPorId.get(rotaSelecionada)?.paragens ?? [])].sort((a, b) => a.ordem - b.ordem).map((p) => (
                                <option key={p.id} value={p.id}>{p.ordem}. {p.nome}</option>
                              ))}
                            </select>
                          </div>

                          <div className="min-w-[220px] space-y-2">
                            <Label>Desembarque</Label>
                            <select
                              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                              value={desembarqueSelecionado}
                              onChange={(e) => setDesembarquePorPedido((prev) => ({ ...prev, [pedido.id]: e.target.value }))}
                            >
                              <option value="">— seleccionar paragem —</option>
                              {[...(rotaPorId.get(rotaSelecionada)?.paragens ?? [])].sort((a, b) => a.ordem - b.ordem).map((p) => (
                                <option key={p.id} value={p.id}>{p.ordem}. {p.nome}</option>
                              ))}
                            </select>
                          </div>
                        </>
                      )}
                    </>
                  )}

                  {pedido.estado === "aprovado" && (
                    <Button
                      size="sm"
                      disabled={!rotaSelecionada || !embarqueSelecionado || !desembarqueSelecionado || alocar.isPending}
                      onClick={() => alocar.mutate({ pedido, rotaId: rotaSelecionada, embarqueId: embarqueSelecionado, desembarqueId: desembarqueSelecionado })}
                    >
                      Alocar e gerar bilhete QR
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
                    <Button size="sm" variant="outline" disabled={alterarEstado.isPending} onClick={() => alterarEstado.mutate({ id: pedido.id, estado: "agendado" })}>
                      Marcar como agendado
                    </Button>
                  )}

                  <Button size="sm" variant="outline" disabled={editarPedido.isPending} onClick={() => editar(pedido)}>
                    Editar
                  </Button>

                  {pedido.estado !== "cancelado" && pedido.estado !== "rejeitado" && (
                    <Button size="sm" variant="outline" disabled={cancelarPedido.isPending} onClick={() => {
                      if (window.confirm("Cancelar este pedido?")) cancelarPedido.mutate(pedido.id);
                    }}>
                      Cancelar
                    </Button>
                  )}

                  {["rascunho", "cancelado", "rejeitado"].includes(pedido.estado) && (
                    <Button size="sm" variant="destructive" disabled={eliminarPedido.isPending} onClick={() => {
                      if (window.confirm("Eliminar este pedido? Esta acção não pode ser desfeita.")) eliminarPedido.mutate(pedido.id);
                    }}>
                      Eliminar
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
