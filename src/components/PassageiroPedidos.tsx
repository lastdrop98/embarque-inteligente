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
    refetchInterval: 30_000,
    queryFn: async () => {
      // A lista é calculada no servidor: só viagens agendadas, futuras, com lugares e
      // com a origem antes do destino na ordem das paragens.
      const { data, error } = await supabase.rpc("viagens_disponiveis_passageiro", {
        _data: dataViagem,
        _origem: origem,
        _destino: destino,
      });
      if (error) throw error;
      const hhmm = (d: Date) =>
        new Intl.DateTimeFormat("pt-PT", { timeZone: "Africa/Maputo", hour: "2-digit", minute: "2-digit" }).format(d);
      return (data ?? []).map((v) => {
        const fecho = new Date(v.embarque_fecha_em);
        return {
          id: v.rota_id,
          nome: v.rota_nome,
          embarque: { id: v.paragem_embarque_id, nome: v.paragem_embarque },
          desembarque: { id: v.paragem_desembarque_id, nome: v.paragem_desembarque },
          horaEmbarque: v.hora_embarque ?? "",
          horaChegada: v.hora_chegada ?? "",
          horaFechoEmbarque: hhmm(fecho),
          veiculos: { nome: v.veiculo, matricula: v.matricula, lugares: v.lugares },
          lugaresLivres: v.lugares_livres,
          embarqueFechado: Date.now() >= fecho.getTime(),
        };
      });
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
      qc.invalidateQueries({ queryKey: ["rotas-disponiveis-passageiro"] });
      qc.invalidateQueries({ queryKey: ["meus-pedidos-transporte", passageiro.id] });
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
    !pedidos?.some((p) => ["rascunho", "submetido", "em_analise", "aprovado", "alocado"].includes(p.estado));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Reservar viagem</CardTitle>
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
                      <p className="mt-1 text-xs text-muted-foreground">
                        Data: {dataViagem} · Embarque fecha às {rota.horaFechoEmbarque}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Lugares disponíveis: {rota.lugaresLivres} de {rota.veiculos.lugares} · {rota.embarque.nome} → {rota.desembarque.nome}
                      </p>
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
                  Não existem viagens disponíveis para este trajecto e data. O operador precisa de definir data e horários, atribuir um autocarro e marcar a rota como “Agendada”.
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
