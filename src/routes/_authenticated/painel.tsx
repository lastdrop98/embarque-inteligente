import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import MapaVeiculos, { type PosVeiculo } from "@/components/MapaVeiculos";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({
    meta: [
      { title: "Painel Operacional — Rotas & Embarque QR" },
      { name: "description", content: "Passageiros a bordo e lugares livres por veículo, em tempo real." },
      { property: "og:title", content: "Painel Operacional" },
      { property: "og:description", content: "Passageiros a bordo e lugares livres por veículo, em tempo real." },
    ],
  }),
  component: PainelPage,
});

type RotaPainel = {
  id: string;
  nome: string;
  veiculos: (PosVeiculo & { lugares: number }) | null;
  viagens_passageiro: { estado: string }[];
};

function PainelPage() {
  const qc = useQueryClient();

  const { data: rotas } = useQuery({
    queryKey: ["painel"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rotas")
        .select("id, nome, veiculos(id, nome, lugares, latitude, longitude, estado, posicao_updated_at), viagens_passageiro(estado)")
        .order("created_at");
      if (error) throw error;
      return data as unknown as RotaPainel[];
    },
    refetchInterval: 15000,
  });

  useEffect(() => {
    const canal = supabase
      .channel("painel-viagens")
      .on("postgres_changes", { event: "*", schema: "public", table: "viagens_passageiro" }, () => {
        qc.invalidateQueries({ queryKey: ["painel"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "veiculos" }, () => {
        qc.invalidateQueries({ queryKey: ["painel"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [qc]);

  const veiculosNoMapa = useMemo(
    () => (rotas ?? []).map((r) => r.veiculos).filter((v): v is PosVeiculo & { lugares: number } => !!v),
    [rotas],
  );

  const kpis = useMemo(() => {
    let totalABordo = 0;
    let totalLugares = 0;
    let emRota = 0;
    let comLotacaoMaxima = 0;
    for (const r of rotas ?? []) {
      const aBordo = r.viagens_passageiro.filter((v) => v.estado === "a_bordo").length;
      totalABordo += aBordo;
      if (r.veiculos) {
        totalLugares += r.veiculos.lugares;
        if (r.veiculos.estado === "em_rota") emRota++;
        if (aBordo >= r.veiculos.lugares && r.veiculos.lugares > 0) comLotacaoMaxima++;
      }
    }
    return { totalABordo, totalLugares, emRota, comLotacaoMaxima, totalRotas: rotas?.length ?? 0 };
  }, [rotas]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Painel Operacional</h1>
        <p className="text-sm text-muted-foreground">Passageiros a bordo e lugares livres, actualizado em contínuo.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{kpis.totalRotas}</p>
            <p className="text-xs text-muted-foreground">Rotas activas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{kpis.emRota}</p>
            <p className="text-xs text-muted-foreground">Veículos em rota</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">
              {kpis.totalABordo}/{kpis.totalLugares || "—"}
            </p>
            <p className="text-xs text-muted-foreground">A bordo / capacidade total</p>
          </CardContent>
        </Card>
        <Card className={kpis.comLotacaoMaxima ? "border-destructive" : undefined}>
          <CardContent className="p-4">
            <p className={`text-2xl font-bold ${kpis.comLotacaoMaxima ? "text-destructive" : ""}`}>{kpis.comLotacaoMaxima}</p>
            <p className="text-xs text-muted-foreground">Veículos em lotação máxima</p>
          </CardContent>
        </Card>
      </div>

      {!!veiculosNoMapa.length && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Veículos em circulação</CardTitle>
          </CardHeader>
          <CardContent>
            <MapaVeiculos veiculos={veiculosNoMapa} altura={320} />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {rotas?.map((r) => {
          const aBordo = r.viagens_passageiro.filter((v) => v.estado === "a_bordo").length;
          const pendentes = r.viagens_passageiro.filter((v) => v.estado === "pendente").length;
          const lugares = r.veiculos?.lugares ?? 0;
          const lotado = lugares > 0 && aBordo >= lugares;
          return (
            <Card key={r.id} className={lotado ? "border-destructive" : undefined} style={{ boxShadow: "var(--shadow-panel)" }}>
              <CardHeader>
                <CardTitle className="text-base">{r.nome}</CardTitle>
                <p className="text-xs text-muted-foreground">{r.veiculos?.nome ?? "Sem veículo"}</p>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold">{aBordo}</span>
                  <span className="text-sm text-muted-foreground">a bordo</span>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="secondary">{Math.max(lugares - aBordo, 0)} lugares livres</Badge>
                  <Badge variant="outline">{pendentes} por embarcar</Badge>
                  {lotado && <Badge variant="destructive">Lotação máxima</Badge>}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {!rotas?.length && <p className="text-sm text-muted-foreground">Ainda não há rotas.</p>}
      </div>
    </div>
  );
}
