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
};

export function PassageiroPedidos({ passageiro, userId }: { passageiro: Passageiro; userId: string }) {
  const qc = useQueryClient();
  const hoje = new Date().toISOString().slice(0, 10);
  const [titulo, setTitulo] = useState("");
  const [dataViagem, setDataViagem] = useState(hoje);
  const [hora, setHora] = useState("");
  const [origem, setOrigem] = useState("");
  const [destino, setDestino] = useState("");
  const [numPassageiros, setNumPassageiros] = useState(1);
  const [tipoViatura, setTipoViatura] = useState("");
  const [observacoes, setObservacoes] = useState("");

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
      const { data, error } = await supabase
        .from("pedidos_transporte")
        .insert({
          titulo: titulo.trim() || `Pedido de transporte — ${dataViagem}`,
          data_viagem: dataViagem,
          hora: hora || null,
          origem: origem.trim(),
          destino: destino.trim(),
          num_passageiros: numPassageiros,
          tipo_viatura: tipoViatura.trim() || null,
          observacoes: observacoes.trim() || null,
          categoria: passageiro.categoria,
          passageiro_id: passageiro.id,
          criado_por: userId,
          estado: "submetido",
        })
        .select("id")
        .single();
      if (error) throw error;

      // A notificação não deve impedir a criação do pedido.
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
      setTitulo("");
      setHora("");
      setOrigem("");
      setDestino("");
      setNumPassageiros(1);
      setTipoViatura("");
      setObservacoes("");
      qc.invalidateQueries({ queryKey: ["meus-pedidos-transporte", passageiro.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const podeEnviar =
    dataViagem >= hoje &&
    !!origem.trim() &&
    !!destino.trim() &&
    numPassageiros >= 1 &&
    !criarPedido.isPending;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Solicitar transporte</CardTitle>
          <p className="text-sm text-muted-foreground">
            Envie um pedido de transporte. O operador fará a análise e, quando aplicável, associará a uma rota.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label>Título (opcional)</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Transporte para o evento" />
          </div>
          <div className="space-y-2">
            <Label>Data da viagem</Label>
            <Input type="date" min={hoje} value={dataViagem} onChange={(e) => setDataViagem(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Hora (opcional)</Label>
            <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Origem</Label>
            <Input value={origem} onChange={(e) => setOrigem(e.target.value)} placeholder="Local de partida" />
          </div>
          <div className="space-y-2">
            <Label>Destino</Label>
            <Input value={destino} onChange={(e) => setDestino(e.target.value)} placeholder="Local de chegada" />
          </div>
          <div className="space-y-2">
            <Label>Número de passageiros</Label>
            <Input
              type="number"
              min={1}
              value={numPassageiros}
              onChange={(e) => setNumPassageiros(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <div className="space-y-2">
            <Label>Tipo de viatura (opcional)</Label>
            <Input value={tipoViatura} onChange={(e) => setTipoViatura(e.target.value)} placeholder="Ex.: Minibus" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Observações</Label>
            <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Informações adicionais para o operador" />
          </div>
          <div className="md:col-span-2">
            <Button disabled={!podeEnviar} onClick={() => criarPedido.mutate()}>
              {criarPedido.isPending ? "A enviar..." : "Enviar pedido"}
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
