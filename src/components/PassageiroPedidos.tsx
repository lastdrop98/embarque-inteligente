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

function dataLocalISO() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

const ESTADOS_PEDIDO: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  rascunho: { label: "Rascunho", variant: "outline" },
  submetido: { label: "Submetido", variant: "secondary" },
  em_analise: { label: "Em análise", variant: "default" },
  aprovado: { label: "Aprovado", variant: "default" },
  alocado: { label: "Alocado", variant: "default" },
  agendado: { label: "Agendado", variant: "default" },
  rejeitado: { label: "Rejeitado", variant: "destructive" },
};

export function PassageiroPedidos({ passageiro }: { passageiro: Passageiro; userId: string }) {
  const qc = useQueryClient();
  const hoje = dataLocalISO();
  const [dataViagem, setDataViagem] = useState(hoje);
  const [origem, setOrigem] = useState("");
  const [destino, setDestino] = useState("");
  const [rotaEscolhida, setRotaEscolhida] = useState<string | null>(null);

  const pontosQuery = useQuery({
    queryKey: ["pontos-disponiveis", dataViagem],
    enabled: !!dataViagem && dataViagem >= hoje,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("pontos_disponiveis", { _data: dataViagem });
      if (error) throw error;
      return data ?? [];
    },
  });

  const rotasQuery = useQuery({
    queryKey: ["rotas-disponiveis", dataViagem, origem, destino],
    enabled: !!dataViagem && dataViagem >= hoje && !!origem && !!destino && origem !== destino,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rotas_disponiveis", { _data: dataViagem, _origem: origem, _destino: destino });
      if (error) throw error;
      return data ?? [];
    },
  });

  const pedidosQuery = useQuery({
    queryKey: ["meus-pedidos-transporte", passageiro.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("pedidos_transporte")
        .select("id, titulo, data_viagem, hora, origem, destino, num_passageiros, tipo_viatura, estado, created_at")
        .eq("passageiro_id", passageiro.id).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const reservar = useMutation({
    mutationFn: async () => {
      const opcao = (rotasQuery.data ?? []).find((r) => r.rota_id === rotaEscolhida);
      if (!opcao) throw new Error("Seleccione uma viagem disponível.");
      const { error } = await supabase.rpc("reservar_viagem", {
        _rota_id: opcao.rota_id,
        _embarque_id: opcao.paragem_embarque_id,
        _desembarque_id: opcao.paragem_desembarque_id,
      });
      if (error) throw error;
      return opcao;
    },
    onSuccess: async (opcao) => {
      const horaPartida = String(opcao.hora_partida ?? "").slice(0, 5) || "por confirmar";
      toast.success(`Viagem reservada para ${dataViagem}, partida às ${horaPartida}, autocarro ${opcao.veiculo || "a atribuir"}. O embarque fecha 10 minutos antes da partida.`);
      setRotaEscolhida(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["minhas-viagens"] }),
        qc.invalidateQueries({ queryKey: ["meus-pedidos-transporte", passageiro.id] }),
        qc.invalidateQueries({ queryKey: ["rotas-disponiveis"] }),
      ]);
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível reservar a viagem."),
  });

  function mudarData(value: string) {
    setDataViagem(value); setOrigem(""); setDestino(""); setRotaEscolhida(null);
  }
  function mudarOrigem(value: string) {
    setOrigem(value); setDestino(""); setRotaEscolhida(null);
  }

  const pontos = pontosQuery.data ?? [];
  const destinos = pontos.filter((p) => p.nome !== origem);
  const rotas = rotasQuery.data ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Encontrar uma viagem</CardTitle>
          <p className="text-sm text-muted-foreground">Escolha a data, a origem e o destino. As rotas e os horários são definidos pelo operador.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Data da viagem</Label>
            <input className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" type="date" min={hoje} value={dataViagem} onChange={(e) => mudarData(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Ponto de partida</Label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={origem} onChange={(e) => mudarOrigem(e.target.value)} disabled={pontosQuery.isLoading || !pontos.length}>
              <option value="">Seleccione a origem</option>
              {pontos.map((p) => <option key={p.nome} value={p.nome}>{p.nome}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Destino</Label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={destino} onChange={(e) => { setDestino(e.target.value); setRotaEscolhida(null); }} disabled={!origem}>
              <option value="">Seleccione o destino</option>
              {destinos.map((p) => <option key={p.nome} value={p.nome}>{p.nome}</option>)}
            </select>
          </div>
          {pontosQuery.error && <p className="text-sm text-destructive">Não foi possível carregar os pontos: {(pontosQuery.error as Error).message}</p>}
          {rotasQuery.error && <p className="text-sm text-destructive">Não foi possível pesquisar viagens: {(rotasQuery.error as Error).message}</p>}
          {origem && destino && origem !== destino && (
            <div className="space-y-3 border-t pt-4">
              <h3 className="font-semibold">Viagens disponíveis</h3>
              {rotasQuery.isFetching && <p className="text-sm text-muted-foreground">A procurar horários...</p>}
              {!rotasQuery.isFetching && !rotas.length && !rotasQuery.error && <p className="text-sm text-muted-foreground">Não há viagens disponíveis para este percurso e data.</p>}
              {rotas.map((r) => (
                <button key={r.rota_id} type="button" onClick={() => setRotaEscolhida(r.rota_id)} className={"w-full rounded-lg border p-3 text-left transition " + (rotaEscolhida === r.rota_id ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50")}>
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-medium">{r.rota_nome}</span>
                    <span className="text-sm font-semibold">{String(r.hora_partida ?? "").slice(0, 5)}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{origem} → {destino}</p>
                  <p className="text-xs text-muted-foreground">Autocarro: {r.veiculo || "A atribuir"} · Lugares disponíveis: {r.lugares_livres}</p>
                  {r.hora_chegada && <p className="text-xs text-muted-foreground">Chegada prevista: {String(r.hora_chegada).slice(0, 5)}</p>}
                </button>
              ))}
              <Button className="w-full" disabled={!rotaEscolhida || reservar.isPending} onClick={() => reservar.mutate()}>{reservar.isPending ? "A reservar..." : "Confirmar viagem"}</Button>
              <p className="text-xs text-muted-foreground">O embarque fecha 10 minutos antes da partida. A reserva é validada novamente pelo servidor.</p>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Pedidos anteriores</CardTitle><p className="text-sm text-muted-foreground">Histórico dos pedidos registados anteriormente.</p></CardHeader>
        <CardContent className="space-y-3">
          {pedidosQuery.data?.length ? pedidosQuery.data.map((p) => {
            const estado = ESTADOS_PEDIDO[p.estado] ?? { label: p.estado, variant: "outline" as const };
            return <div key={p.id} className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-3"><div><p className="font-medium">{p.titulo}</p><p className="text-xs text-muted-foreground">{p.data_viagem}{p.hora ? " · " + p.hora.slice(0, 5) : ""}</p></div><Badge variant={estado.variant}>{estado.label}</Badge></div>
              <p className="mt-2 text-sm">{p.origem} → {p.destino}</p>
              <p className="text-xs text-muted-foreground">{p.num_passageiros} passageiro(s){p.tipo_viatura ? " · " + p.tipo_viatura : ""}</p>
            </div>;
          }) : <p className="text-sm text-muted-foreground">Ainda não tem pedidos anteriores.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
