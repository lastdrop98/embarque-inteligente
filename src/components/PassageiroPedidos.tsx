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
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Maputo" }).format(new Date());
  const [dataViagem, setDataViagem] = useState(hoje);
  const [origem, setOrigem] = useState("");
  const [destino, setDestino] = useState("");
  const [rotaId, setRotaId] = useState("");

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

  const { data: rotasDisponiveis, isLoading: aCarregarRotas, error: erroRotas } = useQuery({
    queryKey: ["rotas-disponiveis-passageiro", dataViagem, origem, destino],
    enabled: !!dataViagem && !!origem && !!destino && origem !== destino,
    queryFn: async () => {
      const { data: rotas, error } = await supabase
        .from("rotas")
        .select("id, nome, data_viagem, hora_inicio, hora_fim, estado, veiculo_id, veiculos(nome, matricula, lugares), paragens(id, nome, ordem, hora_prevista)")
        .eq("data_viagem", dataViagem)
        .eq("estado", "agendada")
        .not("veiculo_id", "is", null)
        .order("hora_inicio");
      if (error) throw error;

      const normalizarPonto = (valor: string) =>
        valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
      const candidatas = (rotas ?? []).flatMap((rota) => {
        const paragens = [...(rota.paragens ?? [])].sort((a, b) => a.ordem - b.ordem);
        const origemIdx = paragens.findIndex((p) => normalizarPonto(p.nome) === normalizarPonto(origem));
        const destinoIdx = paragens.findIndex((p) => normalizarPonto(p.nome) === normalizarPonto(destino));
        if (origemIdx < 0 || destinoIdx <= origemIdx) return [];
        const embarque = paragens[origemIdx];
        const desembarque = paragens[destinoIdx];
        const estimarHora = (ordem: number) => {
          if (!rota.hora_inicio || !rota.hora_fim) return null;
          const minutos = (valor: string) => Number(valor.slice(0, 2)) * 60 + Number(valor.slice(3, 5));
          const inicioMin = minutos(rota.hora_inicio);
          let fimMin = minutos(rota.hora_fim);
          if (fimMin < inicioMin) fimMin += 24 * 60;
          const frac = paragens.length > 1 ? (ordem - 1) / (paragens.length - 1) : 0;
          const total = Math.round(inicioMin + (fimMin - inicioMin) * frac) % (24 * 60);
          return String(Math.floor(total / 60)).padStart(2, "0") + ":" + String(total % 60).padStart(2, "0");
        };
        const horaEmbarque = embarque.hora_prevista ?? estimarHora(embarque.ordem) ?? rota.hora_inicio;
        const horaChegada = desembarque.hora_prevista ?? estimarHora(desembarque.ordem) ?? rota.hora_fim;
        if (!horaEmbarque || !horaChegada) return [];
        const instanteEmbarque = new Date(`${dataViagem}T${horaEmbarque.slice(0, 5)}:00+02:00`).getTime();
        return [{ ...rota, embarque, desembarque, horaEmbarque, horaChegada, instanteEmbarque }];
      });

      return candidatas.map((rota) => ({
        ...rota,
        embarqueFechado: Date.now() >= rota.instanteEmbarque - 10 * 60 * 1000,
      }));
    },
  });

  const rotaSelecionada = rotasDisponiveis?.find((r) => r.id === rotaId);

  const { data: pedidos } = useQuery({
    queryKey: ["meus-pedidos-transporte", passageiro.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos_transporte")
        .select("id, titulo, data_viagem, hora, origem, destino, num_passageiros, tipo_viatura, observacoes, estado, rota_id, created_at, rotas(nome, veiculos(nome, matricula))")
        .eq("passageiro_id", passageiro.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: viagensAtivas, isLoading: aCarregarViagensAtivas, error: erroViagensAtivas } = useQuery({
    queryKey: ["viagens-ativas-passageiro", passageiro.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("viagens_passageiro")
        .select("id, estado")
        .eq("passageiro_id", passageiro.id)
        .in("estado", ["pendente", "a_bordo", "desembarcado"]);
      if (error) throw error;
      return data ?? [];
    },
  });

  const confirmarViagem = useMutation({
    mutationFn: async () => {
      if (!origem || !destino || origem === destino) throw new Error("Escolha a origem e um destino diferente.");
      if (!rotaSelecionada) throw new Error("Escolha uma das viagens disponíveis.");
      if (rotaSelecionada.embarqueFechado) throw new Error("O embarque fecha 10 minutos antes da partida.");
      if (viagensAtivas?.length) throw new Error("Já tem uma viagem activa. Conclua ou cancele a viagem actual antes de reservar outra.");
      const { error } = await supabase.rpc("reservar_viagem_passageiro", {
        _rota_id: rotaSelecionada.id,
        _paragem_embarque_id: rotaSelecionada.embarque.id,
        _paragem_desembarque_id: rotaSelecionada.desembarque.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Viagem confirmada! O bilhete já está disponível na sua área.");
      setRotaId("");
      qc.invalidateQueries({ queryKey: ["minhas-viagens", passageiro.id] });
      qc.invalidateQueries({ queryKey: ["viagens-ativas-passageiro", passageiro.id] });
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

  const eliminarTodosPedidos = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("eliminar_meus_pedidos");
      if (error) throw error;
      return Number(data ?? 0);
    },
    onSuccess: (total) => {
      toast.success(total > 0 ? `${total} pedido(s) eliminado(s)` : "Não havia pedidos elimináveis");
      qc.invalidateQueries({ queryKey: ["meus-pedidos-transporte", passageiro.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const podeEnviar =
    dataViagem >= hoje &&
    !!origem &&
    !!destino &&
    origem !== destino &&
    !!rotaSelecionada &&
    !rotaSelecionada.embarqueFechado &&
    !aCarregarViagensAtivas &&
    !erroViagensAtivas &&
    !viagensAtivas?.length &&
    !confirmarViagem.isPending &&
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
            Só pode existir uma viagem activa por passageiro.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Data da viagem</Label>
            <Input type="date" min={hoje} value={dataViagem} onChange={(e) => { setDataViagem(e.target.value); setRotaId(""); }} />
          </div>
          <div className="space-y-2">
            <Label>Ponto de origem</Label>
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={origem} onChange={(e) => { setOrigem(e.target.value); setRotaId(""); }}>
              <option value="">Escolha o ponto</option>
              {pontos?.map((p) => <option key={p.id} value={p.nome}>{p.nome}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Destino</Label>
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={destino} onChange={(e) => { setDestino(e.target.value); setRotaId(""); }}>
              <option value="">Escolha o destino</option>
              {pontos?.map((p) => <option key={p.id} value={p.nome}>{p.nome}</option>)}
            </select>
          </div>
          <div className="md:col-span-3 space-y-3">
            <div className="space-y-1">
              <Label>Viagens disponíveis definidas pelo operador</Label>
              {!origem || !destino || origem === destino ? (
                <p className="text-xs text-muted-foreground">Seleccione a data, a origem e um destino diferente para consultar as viagens.</p>
              ) : aCarregarRotas ? (
                <p className="text-xs text-muted-foreground">A procurar horários disponíveis…</p>
              ) : erroRotas ? (
                <p className="text-xs text-destructive">Não foi possível consultar as rotas: {(erroRotas as Error).message}</p>
              ) : rotasDisponiveis?.length ? (
                <div className="grid gap-2">
                  {rotasDisponiveis.map((rota) => (
                    <button
                      key={rota.id}
                      type="button"
                      disabled={rota.embarqueFechado}
                      onClick={() => setRotaId(rota.id)}
                      className={`w-full rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${rotaId === rota.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-primary/50"}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold">{rota.nome}</span>
                        <Badge variant={rota.embarqueFechado ? "destructive" : "secondary"}>
                          {rota.embarqueFechado ? "Embarque fechado" : "Disponível"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm">{rota.horaEmbarque.slice(0, 5)} — {rota.horaChegada.slice(0, 5)}</p>
                      <p className="text-xs text-muted-foreground">
                        Autocarro: {rota.veiculos?.nome ?? "Por atribuir"}
                        {rota.veiculos?.matricula ? ` · ${rota.veiculos.matricula}` : ""}
                      </p>
                      {rotaId === rota.id && <p className="mt-1 text-xs font-semibold text-primary">Viagem seleccionada</p>}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                  Não existem viagens agendadas para este trajecto e data. O operador precisa de configurar a rota e marcar o estado como “Agendada”.
                </p>
              )}
            </div>
            {erroViagensAtivas && <p className="text-xs text-destructive">Não foi possível verificar se já tem uma viagem activa. Actualize a página e tente novamente.</p>}
            <p className="text-xs text-muted-foreground">O horário, a rota e o autocarro são definidos pelo operador. Ao confirmar, a viagem fica registada e o bilhete QR é emitido. O embarque fecha 10 minutos antes da partida.</p>
            <Button disabled={!podeEnviar} onClick={() => confirmarViagem.mutate()}>
              {confirmarViagem.isPending ? "A confirmar..." : "Confirmar viagem"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Os meus pedidos</CardTitle>
          <p className="text-sm text-muted-foreground">Acompanhe aqui o estado de cada solicitação.</p>
          {pedidos?.some((p) => ["rascunho", "submetido", "cancelado", "rejeitado"].includes(p.estado)) && (
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              disabled={eliminarTodosPedidos.isPending}
              onClick={() => {
                if (window.confirm("Eliminar todos os pedidos que podem ser eliminados? Esta acção não pode ser desfeita.")) {
                  eliminarTodosPedidos.mutate();
                }
              }}
            >
              {eliminarTodosPedidos.isPending ? "A eliminar..." : "Eliminar pedidos antigos"}
            </Button>
          )}
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
                {pedido.rotas?.nome && <p className="mt-1 text-xs text-muted-foreground">Rota seleccionada: {pedido.rotas.nome}{pedido.hora ? ` · ${pedido.hora.slice(0, 5)}` : ""}</p>}
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
