import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, MapPinned } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import MapaVeiculos, { type PosParagem, type PosVeiculo } from "@/components/MapaVeiculos";

type RotaActiva = {
  id: string;
  nome: string;
  estado: string;
  veiculo_id: string | null;
  veiculos: (PosVeiculo & { lugares?: number }) | null;
  paragens: PosParagem[];
};

export function MapaRotasActivas() {
  const qc = useQueryClient();
  const [rotaEscolhida, setRotaEscolhida] = useState("");
  const { data: rotas = [] } = useQuery({
    queryKey: ["mapa-rotas-activas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rotas")
        .select("id, nome, estado, veiculo_id, veiculos(id, nome, latitude, longitude, estado, posicao_updated_at, lugares), paragens(id, nome, ordem, latitude, longitude)")
        .in("estado", ["embarque_aberto", "embarque_fechado", "em_curso"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RotaActiva[];
    },
    refetchInterval: 5000,
  });
  const { data: veiculos = [] } = useQuery({
    queryKey: ["mapa-todos-veiculos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("veiculos")
        .select("id, nome, latitude, longitude, estado, posicao_updated_at");
      if (error) throw error;
      return data as PosVeiculo[];
    },
    refetchInterval: 5000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("mapa-global-tempo-real")
      .on("postgres_changes", { event: "*", schema: "public", table: "rotas" }, () => {
        qc.invalidateQueries({ queryKey: ["mapa-rotas-activas"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "paragens" }, () => {
        qc.invalidateQueries({ queryKey: ["mapa-rotas-activas"] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "veiculos" }, () => {
        qc.invalidateQueries({ queryKey: ["mapa-rotas-activas"] });
        qc.invalidateQueries({ queryKey: ["mapa-todos-veiculos"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  useEffect(() => {
    if (rotas.length && !rotas.some((r) => r.id === rotaEscolhida)) setRotaEscolhida(rotas[0]!.id);
  }, [rotas, rotaEscolhida]);

  const rota = rotas.find((r) => r.id === rotaEscolhida) ?? rotas[0];
  const paragens = [...(rota?.paragens ?? [])]
    .filter((p) => p.latitude != null && p.longitude != null)
    .sort((a, b) => a.ordem - b.ordem);
  const alvo = rota?.estado === "em_curso" ? paragens[paragens.length - 1] : paragens[0];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPinned className="h-5 w-5 text-primary" />
            Mapa de operações em tempo real
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Posição GPS, trajecto e paragens das rotas activas.
          </p>
        </div>
        {rotas.length > 0 && (
          <select
            aria-label="Seleccionar rota para acompanhar no mapa"
            className="h-10 max-w-full rounded-md border bg-background px-3 text-sm sm:max-w-[300px]"
            value={rota?.id ?? ""}
            onChange={(event) => setRotaEscolhida(event.target.value)}
          >
            {rotas.map((r) => <option key={r.id} value={r.id}>{r.nome} · {r.estado.replaceAll("_", " ")}</option>)}
          </select>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {rota ? (
          <>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Activity className="h-3.5 w-3.5 text-emerald-600" />
              {rota.estado === "em_curso"
                ? "Viagem em curso — a acompanhar a próxima etapa da rota."
                : "Rota operacional — a acompanhar a aproximação ao embarque."}
            </div>
            <MapaVeiculos
              veiculos={rota.veiculos ? [rota.veiculos] : []}
              paragens={paragens}
              tracado
              objetivoVeiculoId={alvo?.id ?? ""}
              altura={380}
            />
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Ainda não há rotas activas. O mapa apresenta as posições conhecidas dos veículos.
            </p>
            <MapaVeiculos veiculos={veiculos} altura={380} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
