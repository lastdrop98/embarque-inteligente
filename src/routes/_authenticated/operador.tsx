import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import MapaVeiculos from "@/components/MapaVeiculos";
import { PedidosOperador } from "@/components/PedidosOperador";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/operador")({
  head: () => ({
    meta: [
      { title: "Painel do Operador — Rotas & Embarque QR" },
      { name: "description", content: "Criar rotas, paragens, passageiros e bilhetes QR." },
      { property: "og:title", content: "Painel do Operador" },
      { property: "og:description", content: "Criar rotas, paragens, passageiros e bilhetes QR." },
    ],
  }),
  component: OperadorPage,
});

function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: string[]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

function OperadorPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Painel do Operador</h1>
        <p className="text-sm text-muted-foreground">Rotas, paragens, passageiros e bilhetes QR.</p>
      </div>
      <Tabs defaultValue="rotas">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="pedidos">Pedidos</TabsTrigger>
          <TabsTrigger value="rotas">Rotas</TabsTrigger>
          <TabsTrigger value="veiculos">Veículos</TabsTrigger>
          <TabsTrigger value="delegacoes">Delegações</TabsTrigger>
          <TabsTrigger value="passageiros">Passageiros</TabsTrigger>
          <TabsTrigger value="viagens">Atribuições</TabsTrigger>
        </TabsList>
        <TabsContent value="pedidos" className="mt-6"><PedidosOperador /></TabsContent>
        <TabsContent value="rotas" className="mt-6"><Rotas /></TabsContent>
        <TabsContent value="veiculos" className="mt-6"><Veiculos /></TabsContent>
        <TabsContent value="delegacoes" className="mt-6"><Delegacoes /></TabsContent>
        <TabsContent value="passageiros" className="mt-6"><Passageiros /></TabsContent>
        <TabsContent value="viagens" className="mt-6"><Viagens /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------------- Veículos ---------------- */

const ESTADOS_VEICULO: Record<string, string> = {
  disponivel: "Disponível",
  em_rota: "Em rota",
  manutencao: "Em manutenção",
  indisponivel: "Indisponível",
};

function useVeiculos() {
  return useQuery({
    queryKey: ["veiculos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("veiculos").select("*").order("nome");
      if (error) throw error;
      return data;
    },
  });
}

function Veiculos() {
  const { data } = useVeiculos();
  const invalidate = useInvalidate();
  const [nome, setNome] = useState("");
  const [matricula, setMatricula] = useState("");
  const [lugares, setLugares] = useState(20);

  const criar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("veiculos").insert({ nome, matricula, lugares, estado: "disponivel" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Veículo criado");
      setNome("");
      setMatricula("");
      invalidate("veiculos");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mudarEstado = useMutation({
    mutationFn: async ({ id, estado }: { id: string; estado: string }) => {
      const { error } = await supabase.from("veiculos").update({ estado }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate("veiculos"),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Novo veículo</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label>Nome</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
          <div className="space-y-2"><Label>Matrícula</Label><Input value={matricula} onChange={(e) => setMatricula(e.target.value)} /></div>
          <div className="space-y-2"><Label>Lugares</Label><Input type="number" min={1} value={lugares} onChange={(e) => setLugares(Number(e.target.value))} /></div>
          <Button disabled={!nome || criar.isPending} onClick={() => criar.mutate()}>Criar veículo</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Veículos</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {data?.length ? data.map((v) => (
            <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
              <span>{v.nome} <span className="text-muted-foreground">{v.matricula}</span></span>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{v.lugares} lugares</Badge>
                <select
                  className="h-8 rounded-md border bg-background px-2 text-xs"
                  value={v.estado}
                  onChange={(e) => mudarEstado.mutate({ id: v.id, estado: e.target.value })}
                >
                  {Object.entries(ESTADOS_VEICULO).map(([valor, rotulo]) => (
                    <option key={valor} value={valor}>{rotulo}</option>
                  ))}
                </select>
              </div>
            </div>
          )) : <p className="text-sm text-muted-foreground">Ainda não há veículos.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------- Delegações ---------------- */

function useDelegacoes() {
  return useQuery({
    queryKey: ["delegacoes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("delegacoes").select("*").order("nome");
      if (error) throw error;
      return data;
    },
  });
}

function Delegacoes() {
  const { data } = useDelegacoes();
  const invalidate = useInvalidate();
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState("");
  const [contacto, setContacto] = useState("");

  const criar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("delegacoes").insert({ nome, tipo: tipo || null, contacto: contacto || null });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Delegação criada");
      setNome("");
      setTipo("");
      setContacto("");
      invalidate("delegacoes", "passageiros");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Nova delegação</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label>Nome</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Angola" /></div>
          <div className="space-y-2"><Label>Tipo</Label><Input value={tipo} onChange={(e) => setTipo(e.target.value)} placeholder="Ex: país, equipa, organização" /></div>
          <div className="space-y-2"><Label>Contacto</Label><Input value={contacto} onChange={(e) => setContacto(e.target.value)} /></div>
          <Button disabled={!nome || criar.isPending} onClick={() => criar.mutate()}>Criar delegação</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Delegações</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {data?.length ? data.map((d) => (
            <div key={d.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span>{d.nome} {d.tipo && <span className="text-muted-foreground">· {d.tipo}</span>}</span>
              {d.contacto && <span className="text-muted-foreground">{d.contacto}</span>}
            </div>
          )) : <p className="text-sm text-muted-foreground">Ainda não há delegações.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------- Rotas + paragens ---------------- */

const ESTADOS_ROTA: Record<string, string> = {
  rascunho: "Rascunho",
  agendada: "Agendada",
  embarque_aberto: "Embarque aberto",
  embarque_fechado: "Embarque fechado",
  em_curso: "Em curso",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

const COR_ESTADO_ROTA: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  rascunho: "outline",
  agendada: "secondary",
  embarque_aberto: "default",
  embarque_fechado: "secondary",
  em_curso: "default",
  concluida: "secondary",
  cancelada: "destructive",
};

const TRANSICOES_ROTA: Record<string, string[]> = {
  rascunho: ["agendada", "cancelada"],
  agendada: ["embarque_aberto", "cancelada"],
  embarque_aberto: ["embarque_fechado", "cancelada"],
  embarque_fechado: ["em_curso", "cancelada"],
  em_curso: ["concluida"],
  concluida: [],
  cancelada: [],
};

function useRotas() {
  return useQuery({
    queryKey: ["rotas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rotas")
        .select("*, veiculos(nome, lugares), paragens(id, nome, ordem, hora_prevista, latitude, longitude)")
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

function Rotas() {
  const { data: rotas } = useRotas();
  const { data: veiculos } = useVeiculos();
  const invalidate = useInvalidate();
  const { data: motoristas } = useQuery({
    queryKey: ["motoristas"],
    queryFn: async () => {
      const { data: papeis } = await supabase.from("papeis_utilizador").select("user_id").eq("role", "motorista");
      const ids = (papeis ?? []).map((p) => p.user_id);
      if (!ids.length) return [];
      const { data } = await supabase.from("perfis").select("id, nome, email").in("id", ids);
      return data ?? [];
    },
  });

  const [nome, setNome] = useState("");
  const [veiculoId, setVeiculoId] = useState("");
  const [motoristaId, setMotoristaId] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [previstos, setPrevistos] = useState("");
  const [dataServico, setDataServico] = useState("");

  const criar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("rotas").insert({
        nome,
        veiculo_id: veiculoId || null,
        motorista_id: motoristaId || null,
        hora_inicio: inicio || null,
        hora_fim: fim || null,
        data_servico: dataServico || null,
        passageiros_previstos: previstos ? Number(previstos) : null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Rota criada"); setNome(""); setPrevistos(""); invalidate("rotas"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Nova rota</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-6">
          <div className="space-y-2 md:col-span-2"><Label>Nome</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
          <div className="space-y-2">
            <Label>Veículo</Label>
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={veiculoId} onChange={(e) => setVeiculoId(e.target.value)}>
              <option value="">—</option>
              {veiculos?.map((v) => <option key={v.id} value={v.id}>{v.nome} {v.estado === "disponivel" ? "· disponível" : ""}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Motorista</Label>
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={motoristaId} onChange={(e) => setMotoristaId(e.target.value)}>
              <option value="">—</option>
              {motoristas?.map((m) => <option key={m.id} value={m.id}>{m.nome || m.email}</option>)}
            </select>
          </div>
          <div className="space-y-2"><Label>Data da viagem</Label><Input type="date" value={dataServico} onChange={(e) => setDataServico(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2"><Label>Partida</Label><Input type="time" value={inicio} onChange={(e) => setInicio(e.target.value)} /></div>
            <div className="space-y-2"><Label>Chegada</Label><Input type="time" value={fim} onChange={(e) => setFim(e.target.value)} /></div>
          </div>
          <p className="text-xs text-muted-foreground md:col-span-6">
            Com data, partida e paragens definidas, a rota aparece aos passageiros para reservarem. O embarque fecha 10 minutos antes da partida.
          </p>
          <div className="space-y-2"><Label>Passageiros previstos</Label><Input type="number" min={0} value={previstos} onChange={(e) => setPrevistos(e.target.value)} /></div>
          <div className="md:col-span-6">
            <Button disabled={!nome || criar.isPending} onClick={() => criar.mutate()}>Criar rota</Button>
          </div>
        </CardContent>
      </Card>

      {rotas?.map((r) => <RotaCard key={r.id} rota={r} />)}
      {!rotas?.length && <p className="text-sm text-muted-foreground">Ainda não há rotas.</p>}
    </div>
  );
}

type Paragem = { id: string; nome: string; ordem: number; hora_prevista: string | null; latitude: number | null; longitude: number | null };
type RotaRow = {
  id: string;
  nome: string;
  hora_inicio: string | null;
  hora_fim: string | null;
  hora_partida_real: string | null;
  hora_chegada_real: string | null;
  estado: string;
  passageiros_previstos: number | null;
  veiculos: { nome: string; lugares: number } | null;
  paragens: Paragem[];
};

function useReconciliacao(rotaId: string) {
  return useQuery({
    queryKey: ["reconciliacao", rotaId],
    queryFn: async () => {
      const { data, error } = await supabase.from("viagens_passageiro").select("estado").eq("rota_id", rotaId);
      if (error) throw error;
      const contagem = { pendente: 0, a_bordo: 0, desembarcado: 0, concluida: 0, recusada: 0, nao_compareceu: 0 };
      for (const v of data) contagem[v.estado as keyof typeof contagem]++;
      const embarcados = contagem.a_bordo + contagem.desembarcado + contagem.concluida;
      return { total: data.length, embarcados, emFalta: contagem.pendente, naoCompareceu: contagem.nao_compareceu, desembarcados: contagem.desembarcado + contagem.concluida };
    },
  });
}

function RotaCard({ rota }: { rota: RotaRow }) {
  const invalidate = useInvalidate();
  const paragens = [...(rota.paragens ?? [])].sort((a, b) => a.ordem - b.ordem);
  const { data: reconciliacao } = useReconciliacao(rota.id);
  const [nome, setNome] = useState("");
  const [hora, setHora] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");

  const addParagem = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("paragens").insert({
        rota_id: rota.id,
        nome,
        ordem: paragens.length + 1,
        hora_prevista: hora || null,
        latitude: lat ? Number(lat) : null,
        longitude: lng ? Number(lng) : null,
      });
      if (error) throw error;
    },
    onSuccess: () => { setNome(""); setHora(""); setLat(""); setLng(""); invalidate("rotas"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const mudarEstado = useMutation({
    mutationFn: async (novoEstado: string) => {
      if (novoEstado === "concluida") {
        const { error } = await supabase.rpc("concluir_rota_segura", { _rota_id: rota.id });
        if (error) throw error;
        return;
      }

      const { error } = await supabase
        .from("rotas")
        .update({ estado: novoEstado as Database["public"]["Enums"]["estado_rota"] })
        .eq("id", rota.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Estado da rota actualizado");
      invalidate("rotas", "reconciliacao", "viagens");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fecharEmbarque = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("viagens_passageiro")
        .update({ estado: "nao_compareceu" })
        .eq("rota_id", rota.id)
        .eq("estado", "pendente");
      if (error) throw error;
      const { error: erroRota } = await supabase.from("rotas").update({ estado: "embarque_fechado" }).eq("id", rota.id);
      if (erroRota) throw erroRota;
    },
    onSuccess: () => {
      toast.success("Embarque fechado — pendentes marcados como não compareceu");
      invalidate("rotas", "reconciliacao", "viagens");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sobrelotada = rota.veiculos && reconciliacao && reconciliacao.embarcados > rota.veiculos.lugares;
  const proximosEstados = TRANSICOES_ROTA[rota.estado] ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-3 text-base">
          {rota.nome}
          {rota.veiculos && <Badge variant="secondary">{rota.veiculos.nome}</Badge>}
          {rota.hora_inicio && <span className="text-xs font-normal text-muted-foreground">{rota.hora_inicio.slice(0, 5)}–{rota.hora_fim?.slice(0, 5) ?? ""}</span>}
          <Badge variant={COR_ESTADO_ROTA[rota.estado] ?? "outline"}>{ESTADOS_ROTA[rota.estado] ?? rota.estado}</Badge>
          <select
            className="ml-auto h-8 rounded-md border bg-background px-2 text-xs"
            value={rota.estado}
            disabled={mudarEstado.isPending || proximosEstados.length === 0}
            onChange={(e) => mudarEstado.mutate(e.target.value)}
          >
            <option value={rota.estado}>{ESTADOS_ROTA[rota.estado] ?? rota.estado}</option>
            {proximosEstados.map((valor) => (
              <option key={valor} value={valor}>{ESTADOS_ROTA[valor] ?? valor}</option>
            ))}
          </select>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Reconciliação */}
        <div className="flex flex-wrap items-center gap-3 rounded-md border bg-secondary/50 px-3 py-2 text-sm">
          <span>Previstos: <strong>{rota.passageiros_previstos ?? "—"}</strong></span>
          <span>Manifesto: <strong>{reconciliacao?.total ?? 0}</strong></span>
          <span>Embarcados: <strong>{reconciliacao?.embarcados ?? 0}</strong></span>
          <span>Em falta: <strong>{reconciliacao?.emFalta ?? 0}</strong></span>
          {!!reconciliacao?.naoCompareceu && <span>Não compareceu: <strong>{reconciliacao.naoCompareceu}</strong></span>}
          {sobrelotada && <Badge variant="destructive" className="ml-auto">Sobrelotação</Badge>}
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            disabled={fecharEmbarque.isPending || rota.estado !== "embarque_aberto"}
            onClick={() => fecharEmbarque.mutate()}
          >
            Fechar embarque
          </Button>
        </div>

        {/* Horas reais / histórico */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>Planeado: {rota.hora_inicio?.slice(0, 5) ?? "—"} → {rota.hora_fim?.slice(0, 5) ?? "—"}</span>
          <span>Real: {rota.hora_partida_real ? new Date(rota.hora_partida_real).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }) : "—"} → {rota.hora_chegada_real ? new Date(rota.hora_chegada_real).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }) : "—"}</span>
        </div>

        <MapaVeiculos
          paragens={paragens}
          tracado
          altura={260}
          onCliqueMapa={(latClique, lngClique) => {
            if (!nome) {
              toast.error("Escreve primeiro o nome da paragem, depois clica no mapa.");
              return;
            }
            setLat(String(latClique));
            setLng(String(lngClique));
          }}
        />
        <p className="text-xs text-muted-foreground">
          Escreve o nome da paragem em baixo e depois clica no mapa para definir a localização.
        </p>
        <ol className="space-y-1">
          {paragens.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">{p.ordem}</span>
              <span className="flex-1">{p.nome}</span>
              {p.hora_prevista && <span className="text-muted-foreground">{p.hora_prevista.slice(0, 5)}</span>}
            </li>
          ))}
          {!paragens.length && <p className="text-sm text-muted-foreground">Sem paragens.</p>}
        </ol>
        <div className="grid gap-2 md:grid-cols-5">
          <Input placeholder="Nome da paragem" value={nome} onChange={(e) => setNome(e.target.value)} />
          <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
          <Input placeholder="Latitude" value={lat} onChange={(e) => setLat(e.target.value)} />
          <Input placeholder="Longitude" value={lng} onChange={(e) => setLng(e.target.value)} />
          <Button variant="outline" disabled={!nome || addParagem.isPending} onClick={() => addParagem.mutate()}>Adicionar paragem</Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------------- Passageiros ---------------- */

const CATEGORIAS: Record<string, string> = {
  atleta: "Atleta",
  coach: "Coach",
  official: "Official",
  media: "Media",
  sponsor: "Sponsor",
  guest: "Guest",
  vip: "VIP",
  staff: "Staff",
  voluntario: "Voluntário",
  arbitro: "Árbitro",
  independente: "Independente",
};

function usePassageiros() {
  return useQuery({
    queryKey: ["passageiros"],
    queryFn: async () => {
      const { data, error } = await supabase.from("passageiros").select("*, delegacoes(nome)").order("nome");
      if (error) throw error;
      return data;
    },
  });
}

function Passageiros() {
  const { data } = usePassageiros();
  const { data: delegacoes } = useDelegacoes();
  const invalidate = useInvalidate();
  const [nome, setNome] = useState("");
  const [contacto, setContacto] = useState("");
  const [categoria, setCategoria] = useState("independente");
  const [delegacaoId, setDelegacaoId] = useState("");

  const criar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("passageiros").insert({
        nome,
        contacto,
        categoria: categoria as Database["public"]["Enums"]["categoria_passageiro"],
        delegacao_id: delegacaoId || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Passageiro criado");
      setNome("");
      setContacto("");
      setCategoria("independente");
      setDelegacaoId("");
      invalidate("passageiros");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Novo passageiro</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label>Nome</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
          <div className="space-y-2"><Label>Contacto</Label><Input value={contacto} onChange={(e) => setContacto(e.target.value)} /></div>
          <div className="space-y-2">
            <Label>Categoria</Label>
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              {Object.entries(CATEGORIAS).map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Delegação (opcional — deixa em branco para independente)</Label>
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={delegacaoId} onChange={(e) => setDelegacaoId(e.target.value)}>
              <option value="">— sem delegação —</option>
              {delegacoes?.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
            </select>
          </div>
          <Button disabled={!nome || criar.isPending} onClick={() => criar.mutate()}>Criar passageiro</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Passageiros</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {data?.length ? data.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
              <span>{p.nome}</span>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{CATEGORIAS[p.categoria] ?? p.categoria}</Badge>
                {(p.delegacoes as { nome: string } | null)?.nome && (
                  <Badge variant="secondary">{(p.delegacoes as { nome: string }).nome}</Badge>
                )}
                <span className="text-muted-foreground">{p.contacto}</span>
              </div>
            </div>
          )) : <p className="text-sm text-muted-foreground">Ainda não há passageiros.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------- Atribuições / bilhetes ---------------- */

const ESTADOS: Record<string, string> = {
  pendente: "Pendente",
  a_bordo: "A bordo",
  desembarcado: "Desembarcado",
  concluida: "Concluída",
  recusada: "Recusada",
  nao_compareceu: "Não compareceu",
};

function Viagens() {
  const { data: rotas } = useRotas();
  const { data: passageiros } = usePassageiros();
  const invalidate = useInvalidate();
  const [rotaId, setRotaId] = useState("");
  const [passageiroId, setPassageiroId] = useState("");
  const [embarqueId, setEmbarqueId] = useState("");
  const [desembarqueId, setDesembarqueId] = useState("");

  const rota = rotas?.find((r) => r.id === rotaId);
  const paragens = [...(rota?.paragens ?? [])].sort((a, b) => a.ordem - b.ordem);

  const { data: viagens } = useQuery({
    queryKey: ["viagens"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("viagens_passageiro")
        .select("id, estado, token_qr, created_at, passageiros(nome), rotas(nome), embarque:paragens!viagens_passageiro_paragem_embarque_id_fkey(nome)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const atribuir = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("viagens_passageiro").insert({
        rota_id: rotaId,
        passageiro_id: passageiroId,
        paragem_embarque_id: embarqueId || null,
        paragem_desembarque_id: desembarqueId || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Bilhete QR gerado"); invalidate("viagens", "reconciliacao"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Atribuir passageiro a uma rota</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <Label>Rota</Label>
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={rotaId} onChange={(e) => { setRotaId(e.target.value); setEmbarqueId(""); setDesembarqueId(""); }}>
              <option value="">—</option>
              {rotas?.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Passageiro</Label>
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={passageiroId} onChange={(e) => setPassageiroId(e.target.value)}>
              <option value="">—</option>
              {passageiros?.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Paragem de embarque</Label>
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={embarqueId} onChange={(e) => setEmbarqueId(e.target.value)}>
              <option value="">—</option>
              {paragens.map((p) => <option key={p.id} value={p.id}>{p.ordem}. {p.nome}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Paragem de desembarque</Label>
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={desembarqueId} onChange={(e) => setDesembarqueId(e.target.value)}>
              <option value="">—</option>
              {paragens.map((p) => <option key={p.id} value={p.id}>{p.ordem}. {p.nome}</option>)}
            </select>
          </div>
          <div className="md:col-span-4">
            <Button disabled={!rotaId || !passageiroId || !embarqueId || atribuir.isPending} onClick={() => atribuir.mutate()}>
              Gerar bilhete QR
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Bilhetes emitidos</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {viagens?.length ? viagens.map((v) => {
            const url = `${typeof window !== "undefined" ? window.location.origin : ""}/p/${v.token_qr}`;
            return (
              <div key={v.id} className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-sm">
                <span className="font-medium">{(v.passageiros as { nome: string } | null)?.nome}</span>
                <span className="text-muted-foreground">{(v.rotas as { nome: string } | null)?.nome}</span>
                <span className="text-muted-foreground">{(v.embarque as { nome: string } | null)?.nome}</span>
                <span className="text-xs text-muted-foreground">Emitido: {new Date(v.created_at).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })}</span>
                <Badge variant={v.estado === "a_bordo" ? "default" : "secondary"}>{ESTADOS[v.estado]}</Badge>
                <div className="ml-auto flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(url); toast.success("Ligação copiada"); }}>Copiar ligação</Button>
                  <Button size="sm" variant="secondary" asChild><a href={`/p/${v.token_qr}`} target="_blank" rel="noreferrer">Ver QR</a></Button>
                </div>
              </div>
            );
          }) : <p className="text-sm text-muted-foreground">Ainda não há bilhetes.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
