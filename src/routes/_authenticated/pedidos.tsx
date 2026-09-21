import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSessao } from "@/lib/useSessao";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/pedidos")({
  head: () => ({
    meta: [
      { title: "Pedidos de transporte — Rotas & Embarque QR" },
      {
        name: "description",
        content: "Criar, analisar, aprovar e alocar pedidos de transporte para delegações, grupos e passageiros.",
      },
      { property: "og:title", content: "Pedidos de transporte — Rotas & Embarque QR" },
      {
        property: "og:description",
        content: "Fluxo completo do pedido de transporte: rascunho, submissão, aprovação, alocação e agendamento.",
      },
    ],
  }),
  component: PedidosPage,
});

const CATEGORIAS = [
  "atleta",
  "coach",
  "official",
  "media",
  "sponsor",
  "guest",
  "vip",
  "staff",
  "voluntario",
  "arbitro",
  "independente",
] as const;

type Estado = "rascunho" | "submetido" | "em_analise" | "aprovado" | "alocado" | "agendado" | "rejeitado";

const ROTULO_ESTADO: Record<Estado, string> = {
  rascunho: "Rascunho",
  submetido: "Submetido",
  em_analise: "Em análise",
  aprovado: "Aprovado",
  alocado: "Alocado",
  agendado: "Agendado",
  rejeitado: "Rejeitado",
};

const VARIANTE: Record<Estado, "default" | "secondary" | "destructive" | "outline"> = {
  rascunho: "outline",
  submetido: "secondary",
  em_analise: "secondary",
  aprovado: "default",
  alocado: "default",
  agendado: "default",
  rejeitado: "destructive",
};

type Pedido = {
  id: string;
  titulo: string;
  origem: string;
  destino: string;
  data_viagem: string;
  hora: string | null;
  num_passageiros: number;
  categoria: string;
  tipo_viatura: string | null;
  observacoes: string | null;
  estado: Estado;
  rota_id: string | null;
  delegacao_id: string | null;
  created_at: string;
  delegacoes: { nome: string } | null;
  rotas: { nome: string } | null;
};

function PedidosPage() {
  const { data: sessao, isLoading } = useSessao();
  if (isLoading) return null;
  if (!sessao?.user) return null;

  const gestao = sessao.papel === "admin" || sessao.papel === "operador";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pedidos de transporte</h1>
        <p className="text-sm text-muted-foreground">
          Do pedido ao agendamento: rascunho, submissão, análise, aprovação e alocação de viatura.
        </p>
      </div>
      <NovoPedido userId={sessao.user.id} />
      <Lista gestao={gestao} />
    </div>
  );
}

function NovoPedido({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [titulo, setTitulo] = useState("");
  const [origem, setOrigem] = useState("");
  const [destino, setDestino] = useState("");
  const [dataViagem, setDataViagem] = useState("");
  const [hora, setHora] = useState("");
  const [numPassageiros, setNumPassageiros] = useState("1");
  const [categoria, setCategoria] = useState<string>("independente");
  const [delegacaoId, setDelegacaoId] = useState<string>("nenhuma");
  const [tipoViatura, setTipoViatura] = useState("");
  const [observacoes, setObservacoes] = useState("");

  const { data: delegacoes } = useQuery({
    queryKey: ["delegacoes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("delegacoes").select("id, nome").order("nome");
      if (error) throw error;
      return data;
    },
  });

  const criar = useMutation({
    mutationFn: async (estado: Estado) => {
      const { error } = await supabase.from("pedidos_transporte").insert({
        titulo,
        origem,
        destino,
        data_viagem: dataViagem,
        hora: hora || null,
        num_passageiros: Number(numPassageiros) || 1,
        categoria: categoria as Database["public"]["Enums"]["categoria_passageiro"],
        delegacao_id: delegacaoId === "nenhuma" ? null : delegacaoId,
        tipo_viatura: tipoViatura || null,
        observacoes: observacoes || null,
        estado,
        criado_por: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pedido guardado");
      setTitulo("");
      setOrigem("");
      setDestino("");
      setDataViagem("");
      setHora("");
      setNumPassageiros("1");
      setTipoViatura("");
      setObservacoes("");
      qc.invalidateQueries({ queryKey: ["pedidos-transporte"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const valido = origem.trim() && destino.trim() && dataViagem;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Novo pedido</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2 md:col-span-3">
          <Label>Título</Label>
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Delegação A — treino matinal" />
        </div>
        <div className="space-y-2">
          <Label>Origem</Label>
          <Input value={origem} onChange={(e) => setOrigem(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Destino</Label>
          <Input value={destino} onChange={(e) => setDestino(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Nº de passageiros</Label>
          <Input type="number" min={1} value={numPassageiros} onChange={(e) => setNumPassageiros(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Data</Label>
          <Input type="date" value={dataViagem} onChange={(e) => setDataViagem(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Hora</Label>
          <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Tipo de viatura</Label>
          <Input value={tipoViatura} onChange={(e) => setTipoViatura(e.target.value)} placeholder="Ex.: Autocarro 30 lugares" />
        </div>
        <div className="space-y-2">
          <Label>Categoria</Label>
          <Select value={categoria} onValueChange={setCategoria}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIAS.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Delegação</Label>
          <Select value={delegacaoId} onValueChange={setDelegacaoId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="nenhuma">Sem delegação</SelectItem>
              {(delegacoes ?? []).map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 md:col-span-3">
          <Label>Observações</Label>
          <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
        </div>
        <div className="flex gap-2 md:col-span-3">
          <Button disabled={!valido || criar.isPending} onClick={() => criar.mutate("submetido")}>
            Submeter pedido
          </Button>
          <Button variant="outline" disabled={!valido || criar.isPending} onClick={() => criar.mutate("rascunho")}>
            Guardar rascunho
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Lista({ gestao }: { gestao: boolean }) {
  const qc = useQueryClient();

  const { data: pedidos } = useQuery({
    queryKey: ["pedidos-transporte"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos_transporte")
        .select(
          "id, titulo, origem, destino, data_viagem, hora, num_passageiros, categoria, tipo_viatura, observacoes, estado, rota_id, delegacao_id, created_at, delegacoes(nome), rotas(nome)",
        )
        .order("data_viagem", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Pedido[];
    },
    refetchInterval: 30000,
  });

  const { data: rotas } = useQuery({
    queryKey: ["rotas-para-pedidos"],
    enabled: gestao,
    queryFn: async () => {
      const { data, error } = await supabase.from("rotas").select("id, nome").order("nome");
      if (error) throw error;
      return data;
    },
  });

  const actualizar = useMutation({
    mutationFn: async ({ id, campos }: { id: string; campos: Record<string, unknown> }) => {
      const { error } = await supabase
        .from("pedidos_transporte")
        .update(campos as Database["public"]["Tables"]["pedidos_transporte"]["Update"])
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pedido actualizado");
      qc.invalidateQueries({ queryKey: ["pedidos-transporte"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function accoes(p: Pedido) {
    const botoes: { label: string; campos: Record<string, unknown>; variante?: "outline" | "destructive" }[] = [];
    if (p.estado === "rascunho") botoes.push({ label: "Submeter", campos: { estado: "submetido" } });
    if (gestao) {
      if (p.estado === "submetido") botoes.push({ label: "Pôr em análise", campos: { estado: "em_analise" } });
      if (p.estado === "submetido" || p.estado === "em_analise") {
        botoes.push({ label: "Aprovar", campos: { estado: "aprovado" } });
        botoes.push({ label: "Rejeitar", campos: { estado: "rejeitado" }, variante: "destructive" });
      }
      if (p.estado === "alocado") botoes.push({ label: "Agendar", campos: { estado: "agendado" } });
    }
    return botoes;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pedidos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {pedidos?.length ? (
          pedidos.map((p) => (
            <div key={p.id} className="space-y-2 rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={VARIANTE[p.estado]}>{ROTULO_ESTADO[p.estado]}</Badge>
                <span className="font-medium">{p.titulo || `${p.origem} → ${p.destino}`}</span>
                <span className="text-sm text-muted-foreground">
                  {p.origem} → {p.destino}
                </span>
                <span className="text-sm text-muted-foreground">
                  {new Date(p.data_viagem + "T00:00:00").toLocaleDateString("pt-PT")}
                  {p.hora ? ` · ${p.hora.slice(0, 5)}` : ""}
                </span>
                <span className="text-sm text-muted-foreground">{p.num_passageiros} pax · {p.categoria}</span>
                {p.delegacoes?.nome && <Badge variant="outline">{p.delegacoes.nome}</Badge>}
                {p.rotas?.nome && <Badge variant="secondary">Rota: {p.rotas.nome}</Badge>}
              </div>
              {p.observacoes && <p className="text-sm text-muted-foreground">{p.observacoes}</p>}
              <div className="flex flex-wrap items-center gap-2">
                {accoes(p).map((b) => (
                  <Button
                    key={b.label}
                    size="sm"
                    variant={b.variante ?? "outline"}
                    disabled={actualizar.isPending}
                    onClick={() => actualizar.mutate({ id: p.id, campos: b.campos })}
                  >
                    {b.label}
                  </Button>
                ))}
                {gestao && (p.estado === "aprovado" || p.estado === "alocado" || p.estado === "agendado") && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Rota:</span>
                    <Select
                      value={p.rota_id ?? "nenhuma"}
                      onValueChange={(v) =>
                        actualizar.mutate({
                          id: p.id,
                          campos: { rota_id: v === "nenhuma" ? null : v, estado: v === "nenhuma" ? "aprovado" : "alocado" },
                        })
                      }
                    >
                      <SelectTrigger className="h-8 w-56">
                        <SelectValue placeholder="Alocar rota" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nenhuma">Sem rota</SelectItem>
                        {(rotas ?? []).map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">Ainda não há pedidos de transporte.</p>
        )}
      </CardContent>
    </Card>
  );
}
