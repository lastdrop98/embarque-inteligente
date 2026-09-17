import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSessao, type Papel } from "@/lib/useSessao";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import MapaVeiculos from "@/components/MapaVeiculos";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Administração — Rotas & Embarque QR" },
      { name: "description", content: "Gestão de utilizadores, papéis e visão global da plataforma." },
    ],
  }),
  component: AdminPage,
});

const PAPEIS: Papel[] = ["admin", "operador", "motorista", "passageiro"];
const ROTULO_PAPEL: Record<Papel, string> = {
  admin: "Admin",
  operador: "Operador",
  motorista: "Motorista",
  passageiro: "Passageiro",
};

type PerfilRow = { id: string; nome: string; email: string; activo: boolean };
type PapelRow = { id: string; user_id: string; role: Papel };

function useInvalidateAdmin() {
  const qc = useQueryClient();
  return (...keys: string[]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

function AdminPage() {
  const { data: sessao, isLoading: aCarregarSessao } = useSessao();

  if (aCarregarSessao) return null;
  if (sessao?.papel !== "admin") {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-center text-sm text-destructive">
        Acesso restrito a administradores.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Administração</h1>
        <p className="text-sm text-muted-foreground">Utilizadores, papéis, mapa geral e auditoria.</p>
      </div>
      <Kpis />
      <MapaGeral />
      <Utilizadores utilizadorAtualId={sessao.user.id} />
      <Incidentes />
      <Auditoria />
    </div>
  );
}

/* ---------------- KPIs ---------------- */

function Kpis() {
  const { data } = useQuery({
    queryKey: ["admin-kpis"],
    queryFn: async () => {
      const inicioHoje = new Date();
      inicioHoje.setHours(0, 0, 0, 0);

      const [veiculos, rotas, passageiros, bilhetesHoje, rotasOcupacao, incidentesAbertos] = await Promise.all([
        supabase.from("veiculos").select("id, estado"),
        supabase.from("rotas").select("id", { count: "exact", head: true }),
        supabase.from("passageiros").select("id", { count: "exact", head: true }),
        supabase.from("viagens_passageiro").select("id", { count: "exact", head: true }).gte("created_at", inicioHoje.toISOString()),
        supabase.from("rotas").select("veiculos(lugares), viagens_passageiro(estado)"),
        supabase.from("incidentes").select("id", { count: "exact", head: true }).eq("estado", "aberto"),
      ]);

      const veiculosActivos = (veiculos.data ?? []).filter((v) => v.estado === "em_rota").length;

      let somaOcupacao = 0;
      let nRotasComVeiculo = 0;
      for (const r of (rotasOcupacao.data ?? []) as unknown as { veiculos: { lugares: number } | null; viagens_passageiro: { estado: string }[] }[]) {
        if (!r.veiculos?.lugares) continue;
        const aBordo = r.viagens_passageiro.filter((v) => v.estado === "a_bordo").length;
        somaOcupacao += aBordo / r.veiculos.lugares;
        nRotasComVeiculo++;
      }
      const ocupacaoMedia = nRotasComVeiculo ? Math.round((somaOcupacao / nRotasComVeiculo) * 100) : null;

      return {
        veiculosActivos,
        totalRotas: rotas.count ?? 0,
        totalPassageiros: passageiros.count ?? 0,
        bilhetesHoje: bilhetesHoje.count ?? 0,
        ocupacaoMedia,
        incidentesAbertos: incidentesAbertos.count ?? 0,
      };
    },
    refetchInterval: 20000,
  });

  const cartoes = [
    { label: "Veículos em rota", valor: data?.veiculosActivos ?? "—" },
    { label: "Rotas", valor: data?.totalRotas ?? "—" },
    { label: "Passageiros", valor: data?.totalPassageiros ?? "—" },
    { label: "Bilhetes hoje", valor: data?.bilhetesHoje ?? "—" },
    { label: "Ocupação média", valor: data?.ocupacaoMedia != null ? `${data.ocupacaoMedia}%` : "sem dados" },
    { label: "Incidentes abertos", valor: data?.incidentesAbertos ?? "—" },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
      {cartoes.map((c) => (
        <Card key={c.label}>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{c.valor}</p>
            <p className="text-xs text-muted-foreground">{c.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ---------------- Mapa geral ---------------- */

function MapaGeral() {
  const { data } = useQuery({
    queryKey: ["admin-mapa-veiculos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("veiculos").select("id, nome, latitude, longitude, estado, posicao_updated_at");
      if (error) throw error;
      return data;
    },
    refetchInterval: 10000,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Veículos em circulação</CardTitle>
      </CardHeader>
      <CardContent>
        <MapaVeiculos veiculos={data ?? []} altura={360} />
      </CardContent>
    </Card>
  );
}

/* ---------------- Utilizadores ---------------- */

function Utilizadores({ utilizadorAtualId }: { utilizadorAtualId: string }) {
  const invalidate = useInvalidateAdmin();

  const { data: perfis } = useQuery({
    queryKey: ["admin-perfis"],
    queryFn: async () => {
      const { data, error } = await supabase.from("perfis").select("id, nome, email, activo").order("nome");
      if (error) throw error;
      return data as PerfilRow[];
    },
  });

  const { data: papeis } = useQuery({
    queryKey: ["admin-papeis"],
    queryFn: async () => {
      const { data, error } = await supabase.from("papeis_utilizador").select("id, user_id, role");
      if (error) throw error;
      return data as PapelRow[];
    },
  });

  const papelPorUtilizador = useMemo(() => {
    const mapa = new Map<string, PapelRow>();
    (papeis ?? []).forEach((p) => mapa.set(p.user_id, p));
    return mapa;
  }, [papeis]);

  const alterarPapel = useMutation({
    mutationFn: async ({ userId, novoPapel }: { userId: string; novoPapel: Papel }) => {
      const existente = papelPorUtilizador.get(userId);
      if (existente) {
        const { error } = await supabase.from("papeis_utilizador").update({ role: novoPapel }).eq("id", existente.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("papeis_utilizador").insert({ user_id: userId, role: novoPapel });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Papel actualizado");
      invalidate("admin-papeis");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const alternarActivo = useMutation({
    mutationFn: async ({ userId, activo }: { userId: string; activo: boolean }) => {
      const { error } = await supabase.from("perfis").update({ activo }).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Estado da conta actualizado");
      invalidate("admin-perfis");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Utilizadores</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Papel</TableHead>
              <TableHead>Activo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {perfis?.map((p) => {
              const papelAtual = papelPorUtilizador.get(p.id)?.role ?? "motorista";
              return (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    {p.nome || "—"} {p.id === utilizadorAtualId && <Badge variant="secondary" className="ml-2">tu</Badge>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.email}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {PAPEIS.map((papel) => (
                        <Button
                          key={papel}
                          size="sm"
                          variant={papelAtual === papel ? "default" : "outline"}
                          disabled={alterarPapel.isPending}
                          onClick={() => alterarPapel.mutate({ userId: p.id, novoPapel: papel })}
                        >
                          {ROTULO_PAPEL[papel]}
                        </Button>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={p.activo}
                        disabled={p.id === utilizadorAtualId || alternarActivo.isPending}
                        onCheckedChange={(v) => alternarActivo.mutate({ userId: p.id, activo: v })}
                      />
                      <span className="text-xs text-muted-foreground">{p.activo ? "Activo" : "Suspenso"}</span>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {!perfis?.length && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                  Sem utilizadores.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* ---------------- Incidentes ---------------- */

function Incidentes() {
  const invalidate = useInvalidateAdmin();
  const { data } = useQuery({
    queryKey: ["admin-incidentes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("incidentes")
        .select("id, descricao, estado, created_at, rota_id, motorista_id, rotas(nome)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const resolver = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("incidentes").update({ estado: "resolvido" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Incidente marcado como resolvido");
      invalidate("admin-incidentes");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Incidentes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {data?.length ? (
          data.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-sm">
              <Badge variant={i.estado === "aberto" ? "destructive" : "secondary"}>{i.estado}</Badge>
              <span className="font-medium">{(i.rotas as { nome: string } | null)?.nome ?? "Rota desconhecida"}</span>
              <span className="text-muted-foreground">{i.descricao}</span>
              <span className="text-xs text-muted-foreground">{new Date(i.created_at).toLocaleString("pt-PT")}</span>
              {i.estado === "aberto" && (
                <Button size="sm" variant="outline" className="ml-auto" onClick={() => resolver.mutate(i.id)}>
                  Marcar como resolvido
                </Button>
              )}
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">Sem incidentes reportados.</p>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- Auditoria ---------------- */

function Auditoria() {
  const { data: registos } = useQuery({
    queryKey: ["admin-auditoria"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registo_auditoria")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const { data: perfis } = useQuery({
    queryKey: ["admin-perfis"],
    queryFn: async () => {
      const { data, error } = await supabase.from("perfis").select("id, nome, email, activo").order("nome");
      if (error) throw error;
      return data as PerfilRow[];
    },
  });

  const nomePorId = useMemo(() => {
    const mapa = new Map<string, string>();
    (perfis ?? []).forEach((p) => mapa.set(p.id, p.nome || p.email));
    return mapa;
  }, [perfis]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Registo de auditoria</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {registos?.length ? (
          registos.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-xs">
              <span className="font-medium">{nomePorId.get(r.utilizador_alvo) ?? r.utilizador_alvo}</span>
              <span className="text-muted-foreground">
                {r.papel_anterior ?? "—"} → {r.papel_novo ?? "removido"}
              </span>
              <span className="ml-auto text-muted-foreground">
                por {r.alterado_por ? nomePorId.get(r.alterado_por) ?? r.alterado_por : "sistema"} ·{" "}
                {new Date(r.created_at).toLocaleString("pt-PT")}
              </span>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">Sem alterações registadas.</p>
        )}
      </CardContent>
    </Card>
  );
}
