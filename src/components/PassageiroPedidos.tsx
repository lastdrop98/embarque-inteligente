import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

const ESTADOS_PEDIDO: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  rascunho: { label: "Rascunho", variant: "outline" },
  submetido: { label: "Submetido", variant: "secondary" },
  em_analise: { label: "Em análise", variant: "default" },
  aprovado: { label: "Aprovado", variant: "default" },
  alocado: { label: "Alocado", variant: "default" },
  agendado: { label: "Agendado", variant: "default" },
  rejeitado: { label: "Rejeitado", variant: "destructive" },
  cancelado: { label: "Cancelado", variant: "destructive" },
};

export function PassageiroPedidos({ passageiro, userId }: { passageiro: Passageiro; userId: string }) {
  const qc = useQueryClient();
  const hoje = new Date().toISOString().slice(0, 10);
  const [dataViagem, setDataViagem] = useState(hoje);
  const [origem, setOrigem] = useState("");
  const [destino, setDestino] = useState("");

  const { data: pontos } = useQuery({
    queryKey: ["pontos-embarque-predefinidos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pontos_predefinidos")
        .select("id, nome").eq("activo", true)
        .order("nome");
      if (error) throw error;
      const vistos = new Set<string>();
      return (data ?? []).filter((p) => {
        const chave = p.nome.trim().toLowerCase();
        if (vistos.has(chave)) return false;
        vistos.add(chave);
        return true;
      });
    },
  });

  const { data: pedidos } = useQuery({
    queryKey: ["meus-pedidos-transporte", passageiro.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos_transporte")
        .select("id, titulo, data_viagem, hora, origem, destino, num_passageiros, tipo_viatura, observacoes, estado, rota_id, created_at")
        .eq("passageiro_id", passageiro.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const criarPedido = useMutation({
    mutationFn: async () => {
      if (!origem || !destino) throw new Error("Escolha a origem e o destino.");
      if (origem === destino) throw new Error("A origem e o destino devem ser diferentes.");

      const { data: existentes, error: erroExistente } = await supabase
        .from("pedidos_transporte")
        .select("id")
        .eq("passageiro_id", passageiro.id)
        .in("estado", ["rascunho", "submetido", "em_analise", "aprovado", "alocado", "agendado"])
        .limit(1);
      if (erroExistente) throw erroExistente;
      if (existentes?.length) {
        throw new Error("Já possui um pedido de viagem activo. Cancele o pedido actual antes de solicitar outra viagem.");
      }

      const { data, error } = await supabase
        .from("pedidos_transporte")
        .insert({
          titulo: `Viagem de ${passageiro.nome} — ${dataViagem}`,
          data_viagem: dataViagem,
          hora: null,
          origem: origem.trim(),
          destino: destino.trim(),
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
        const { error: notifError } = await supabase.rpc("notificar_novo_pedido", { _pedido_id: data.id });
        if (notifError) console.error(notifError);
      } catch (e) {
        console.error(e);
      }
    },
    onSuccess: () => {
      toast.success("Pedido de viagem enviado");
      setOrigem("");
      setDestino("");
      qc.invalidateQueries({ queryKey: ["meus-pedidos-transporte", passageiro.id] });
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
      qc.invalidateQueries({ queryKey: ["meus-pedidos-transporte", passageiro.id] });
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
      qc.invalidateQueries({ queryKey: ["meus-pedidos-transporte", passageiro.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const podeEnviar =
    dataViagem >= hoje &&
    !!origem &&
    !!destino &&
    origem !== destino &&
    !criarPedido.isPending &&
    !pedidos?.some((p) => ["rascunho", "submetido", "em_analise", "aprovado", "alocado", "agendado"].includes(p.estado));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Solicitar viagem</CardTitle>
          <p className="text-sm text-muted-foreground">
            Passageiro: <strong>{passageiro.nome}</strong> · ID: <strong>{passageiro.id.slice(0, 8).toUpperCase()}</strong>
          </p>
          <p className="text-sm text-muted-foreground">
            Só pode existir uma solicitação activa por passageiro.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Data da viagem</Label>
            <Input type="date" min={hoje} value={dataViagem} onChange={(e) => setDataViagem(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Ponto de origem</Label>
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={origem} onChange={(e) => setOrigem(e.target.value)}>
              <option value="">Escolha o ponto</option>
              {pontos?.map((p) => <option key={p.id} value={p.nome}>{p.nome}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Destino</Label>
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={destino} onChange={(e) => setDestino(e.target.value)}>
              <option value="">Escolha o destino</option>
              {pontos?.map((p) => <option key={p.id} value={p.nome}>{p.nome}</option>)}
            </select>
          </div>
          <div className="md:col-span-3">
            <Button disabled={!podeEnviar} onClick={() => criarPedido.mutate()}>
              {criarPedido.isPending ? "A enviar..." : "Solicitar viagem"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Os meus pedidos</CardTitle>
          <p className="text-sm text-muted-foreground">Acompanhe aqui o estado de cada solicitação.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {pedidos?.length ? pedidos.map((pedido) => {
            const estado = ESTADOS_PEDIDO[pedido.estado] ?? { label: pedido.estado, variant: "outline" as const };
            return (
              <div key={pedido.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{pedido.titulo}</p>
                    <p className="text-xs text-muted-foreground">
                      {pedido.data_viagem}{pedido.hora ? ` · ${pedido.hora.slice(0, 5)}` : ""}
                    </p>
                  </div>
                  <Badge variant={estado.variant}>{estado.label}</Badge>
                </div>
                <p className="mt-2 text-sm">{pedido.origem} → {pedido.destino}</p>
                <p className="text-xs text-muted-foreground">{pedido.num_passageiros} passageiro(s){pedido.tipo_viatura ? ` · ${pedido.tipo_viatura}` : ""}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {["rascunho", "submetido", "em_analise", "aprovado", "alocado", "agendado"].includes(pedido.estado) && (
                    <Button size="sm" variant="outline" disabled={cancelarPedido.isPending} onClick={() => {
                      if (window.confirm("Cancelar este pedido de viagem?")) cancelarPedido.mutate(pedido.id);
                    }}>Cancelar pedido</Button>
                  )}
                  {["rascunho", "submetido", "cancelado", "rejeitado"].includes(pedido.estado) && (
                    <Button size="sm" variant="destructive" disabled={eliminarPedido.isPending} onClick={() => {
                      if (window.confirm("Eliminar este pedido? Esta acção não pode ser desfeita.")) eliminarPedido.mutate(pedido.id);
                    }}>Eliminar</Button>
                  )}
                </div>
              </div>
            );
          }) : (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <p className="font-medium">Ainda não tem pedidos</p>
              <p className="mt-1 text-sm text-muted-foreground">Preencha o formulário para solicitar o seu primeiro transporte.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
