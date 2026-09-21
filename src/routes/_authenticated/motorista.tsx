import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { validarQr, type ResultadoScan } from "@/lib/mobilidade.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import MapaVeiculos, { type PosVeiculo } from "@/components/MapaVeiculos";

export const Route = createFileRoute("/_authenticated/motorista")({
  head: () => ({
    meta: [
      { title: "Ecrã do Motorista — Rotas & Embarque QR" },
      { name: "description", content: "Rota paragem a paragem e validação de embarques por QR Code." },
      { property: "og:title", content: "Ecrã do Motorista" },
      { property: "og:description", content: "Rota paragem a paragem e validação de embarques por QR Code." },
    ],
  }),
  component: MotoristaPage,
});

type Viagem = {
  id: string;
  estado: string;
  paragem_embarque_id: string | null;
  paragem_desembarque_id: string | null;
  passageiros: { nome: string } | null;
};

const TIPOS_INCIDENTE = ["Engarrafamento", "Avaria", "Acidente", "Desvio de rota"] as const;

function MotoristaPage() {
  const qc = useQueryClient();
  const validar = useServerFn(validarQr);
  const [rotaId, setRotaId] = useState("");
  const [paragemId, setParagemId] = useState("");
  const [token, setToken] = useState("");
  const [tipo, setTipo] = useState<"embarque" | "desembarque">("embarque");
  const [resultado, setResultado] = useState<ResultadoScan | null>(null);
  const [scanning, setScanning] = useState(false);
  const [emServico, setEmServico] = useState(false);
  const [incidenteAberto, setIncidenteAberto] = useState<string | null>(null);
  const [descIncidente, setDescIncidente] = useState("");
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const { data: rotas } = useQuery({
    queryKey: ["minhas-rotas"],
    queryFn: async () => {
      const { data, error } = await supabase
        (() => {
        return supabase.auth.getUser().then(async ({ data: { user } }) => {
          if (!user) throw new Error("Utilizador não autenticado.");
          return supabase
            .from("rotas")
            .select("id, nome, motorista_id, veiculo_id, veiculos(id, nome, lugares, latitude, longitude, estado, posicao_updated_at), paragens(id, nome, ordem, hora_prevista, latitude, longitude)")
            .eq("motorista_id", user.id)
            .order("created_at");
        });
      })();
      if (error) throw error;
      return data;
    },
    refetchInterval: 10000,
  });

  // Mostra por defeito apenas rotas operacionais. Evita seleccionar automaticamente
  // uma rota antiga já concluída/cancelada e apresentar uma mensagem enganadora.
  const rotasOperacionais = (rotas ?? []).filter((r) =>
    ["rascunho", "agendada", "embarque_aberto", "embarque_fechado", "em_curso"].includes(r.estado),
  );
  const rota = rotasOperacionais.find((r) => r.id === rotaId) ?? rotasOperacionais[0];
  const paragens = [...(rota?.paragens ?? [])].sort((a, b) => a.ordem - b.ordem);
  const proximaParagem = paragemId ? paragens.find((p) => p.id === paragemId) : paragens[0];

  const { data: viagens } = useQuery({
    queryKey: ["viagens-rota", rota?.id],
    enabled: !!rota?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("viagens_passageiro")
        .select("id, estado, paragem_embarque_id, paragem_desembarque_id, passageiros(nome)")
        .eq("rota_id", rota!.id);
      if (error) throw error;
      return data as unknown as Viagem[];
    },
  });

  const aBordo = (viagens ?? []).filter((v) => v.estado === "a_bordo").length;
  const lugares = (rota?.veiculos as PosVeiculo & { lugares: number } | null)?.lugares ?? 0;
  const lotado = lugares > 0 && aBordo >= lugares;

  // ---- Localização em tempo real ----
  async function iniciarTurno() {
    const veiculoId = rota?.veiculo_id;
    if (!veiculoId) {
      toast.error("Esta rota não tem veículo atribuído.");
      return;
    }
    if (!navigator.geolocation) {
      toast.error("Geolocalização não suportada neste dispositivo.");
      return;
    }
    // O turno pode começar enquanto o embarque está aberto, para activar o GPS
    // e permitir a validação dos passageiros. A rota passa a "em_curso"
    // apenas quando o embarque for fechado.
    if (rota.estado === "embarque_aberto") {
      // Mantém o estado da rota em embarque_aberto durante o embarque.
    } else if (rota.estado === "embarque_fechado") {
      const { error: erroRota } = await supabase.rpc("iniciar_rota_segura", { _rota_id: rota.id });
      if (erroRota) {
        toast.error(erroRota.message);
        return;
      }
      await qc.invalidateQueries({ queryKey: ["minhas-rotas"] });
    } else if (rota.estado !== "em_curso") {
      toast.error("A rota precisa estar com o embarque aberto ou fechado para iniciar o turno.");
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        await supabase
          .from("veiculos")
          .update({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            posicao_updated_at: new Date().toISOString(),
            estado: "em_rota",
          })
          .eq("id", veiculoId);
      },
      (err) => {
        console.error("[motorista] geolocation error:", err);
        toast.error("Não foi possível obter a localização. Verifica as permissões.");
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    setEmServico(true);
    toast.success("Turno iniciado — a partilhar localização.");
  }

  async function terminarTurno() {
    if (rota?.estado === "em_curso") {
      const { error: erroConclusao } = await supabase.rpc("concluir_rota_segura", { _rota_id: rota.id });
      if (erroConclusao) {
        toast.error(erroConclusao.message);
        return;
      }
      qc.invalidateQueries({ queryKey: ["minhas-rotas"] });
    }

    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (rota?.veiculo_id) {
      await supabase.from("veiculos").update({ estado: "inactivo" }).eq("id", rota.veiculo_id);
    }
    setEmServico(false);
    toast.success("Turno terminado.");
  }

  useEffect(() => {
    if (!rota?.veiculo_id) return;

    const canal = supabase
      .channel("posicao-veiculo-motorista-" + rota.veiculo_id)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "veiculos", filter: `id=eq.${rota.veiculo_id}` },
        () => qc.invalidateQueries({ queryKey: ["minhas-rotas"] }),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [rota?.veiculo_id, qc]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  // ---- Scanner QR ----
  async function pararScan() {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch {
        /* ignorar */
      }
      scannerRef.current = null;
    }
    setScanning(false);
  }

  async function iniciarScan() {
    setScanning(true);
    const { Html5Qrcode } = await import("html5-qrcode");
    const scanner = new Html5Qrcode("leitor-qr");
    scannerRef.current = scanner as unknown as { stop: () => Promise<void>; clear: () => void };
    try {
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 240 },
        async (texto: string) => {
          await pararScan();
          setToken(texto);
          await submeter(texto);
        },
        () => {},
      );
    } catch {
      setScanning(false);
      setResultado({ aprovado: false, tipo, motivo: "Câmara indisponível. Introduza o código manualmente." });
    }
  }

  useEffect(() => () => { void pararScan(); }, []);

  async function submeter(valor?: string) {
    const t = (valor ?? token).trim();
    if (!t || !rota) return;
    const r = await validar({ data: { token: t, rotaId: rota.id, paragemId, tipo } });
    setResultado(r);
    setToken("");
    qc.invalidateQueries({ queryKey: ["viagens-rota", rota.id] });
  }

  // ---- Incidentes ----
  const reportarIncidente = useMutation({
    mutationFn: async () => {
      if (!incidenteAberto || !rota) return;
      const { error } = await supabase.from("incidentes").insert({
        rota_id: rota.id,
        motorista_id: (await supabase.auth.getUser()).data.user?.id ?? null,
        tipo: incidenteAberto,
        descricao: descIncidente ? `${incidenteAberto}: ${descIncidente}` : incidenteAberto,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Incidente reportado");
      setIncidenteAberto(null);
      setDescIncidente("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ecrã do Motorista</h1>
          <p className="text-sm text-muted-foreground">Rota atribuída e validação de embarques.</p>
        </div>
        {emServico ? (
          <Button variant="destructive" size="lg" className="h-12 min-w-[160px]" onClick={terminarTurno}>
            Terminar turno
          </Button>
        ) : (
          <Button size="lg" className="h-12 min-w-[160px]" onClick={iniciarTurno}>
            Iniciar turno
          </Button>
        )}
      </div>

      {!rotasOperacionais.length && <p className="text-sm text-muted-foreground">Não existem rotas atribuídas a este motorista neste momento.</p>}

      {lotado && (
        <div className="rounded-lg border border-destructive bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          Veículo em lotação máxima ({aBordo}/{lugares}).
        </div>
      )}

      {rota && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Rota</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Rota</Label>
                <select
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={rota.id}
                  onChange={(e) => { setRotaId(e.target.value); setParagemId(""); }}
                >
                  {rotasOperacionais.map((r) => <option key={r.id} value={r.id}>{r.nome} · {r.estado.replaceAll("_", " ")}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Paragem actual</Label>
                <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={paragemId} onChange={(e) => setParagemId(e.target.value)}>
                  <option value="">Todas</option>
                  {paragens.map((p) => <option key={p.id} value={p.id}>{p.ordem}. {p.nome}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Tipo de leitura</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" className="h-12" variant={tipo === "embarque" ? "default" : "outline"} onClick={() => setTipo("embarque")}>Embarque</Button>
                  <Button type="button" className="h-12" variant={tipo === "desembarque" ? "default" : "outline"} onClick={() => setTipo("desembarque")}>Desembarque</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Mapa da rota</CardTitle>
            </CardHeader>
            <CardContent>
              <MapaVeiculos
                veiculos={rota.veiculos ? [rota.veiculos as PosVeiculo] : []}
                paragens={paragens.map((p) => ({ ...p, destaque: p.id === proximaParagem?.id }))}
                tracado
                altura={300}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Leitura de QR Code</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {scanning
                  ? <Button variant="destructive" className="h-12" onClick={pararScan}>Parar scan</Button>
                  : <Button className="h-12" onClick={iniciarScan}>Abrir leitor (Scan)</Button>}
              </div>
              <div id="leitor-qr" className={scanning ? "mx-auto max-w-sm overflow-hidden rounded-lg border" : "hidden"} />
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[240px] flex-1 space-y-2">
                  <Label>Ou introduza o código manualmente</Label>
                  <Input className="h-12" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Token do bilhete" />
                </div>
                <Button variant="secondary" className="h-12" disabled={!token} onClick={() => submeter()}>Validar</Button>
              </div>

              {resultado && (
                <div
                  className={`rounded-lg px-4 py-3 text-sm font-medium ${
                    resultado.aprovado ? "bg-success text-success-foreground" : "bg-destructive text-destructive-foreground"
                  }`}
                >
                  {resultado.aprovado ? "Aprovado" : "Recusado"}
                  {resultado.passageiro ? ` — ${resultado.passageiro}` : ""}
                  {resultado.motivo ? ` — ${resultado.motivo}` : ""}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Reportar incidente</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {TIPOS_INCIDENTE.map((t) => (
                  <Button
                    key={t}
                    variant={incidenteAberto === t ? "default" : "outline"}
                    className="h-12"
                    onClick={() => setIncidenteAberto(incidenteAberto === t ? null : t)}
                  >
                    {t}
                  </Button>
                ))}
              </div>
              {incidenteAberto && (
                <div className="space-y-2">
                  <Textarea
                    placeholder="Detalhes (opcional)"
                    value={descIncidente}
                    onChange={(e) => setDescIncidente(e.target.value)}
                  />
                  <Button disabled={reportarIncidente.isPending} onClick={() => reportarIncidente.mutate()}>
                    Enviar reporte de "{incidenteAberto}"
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Paragens</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {paragens.map((p) => {
                const recolher = (viagens ?? []).filter((v) => v.paragem_embarque_id === p.id);
                const largar = (viagens ?? []).filter((v) => v.paragem_desembarque_id === p.id);
                return (
                  <div key={p.id} className="rounded-lg border p-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">{p.ordem}</span>
                      <span className="font-medium">{p.nome}</span>
                      {p.hora_prevista && <span className="text-xs text-muted-foreground">{p.hora_prevista.slice(0, 5)}</span>}
                    </div>
                    <div className="mt-2 grid gap-2 text-sm md:grid-cols-2">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Recolher</p>
                        {recolher.length ? recolher.map((v) => (
                          <div key={v.id} className="flex items-center gap-2">
                            <span>{v.passageiros?.nome}</span>
                            <Badge variant={v.estado === "a_bordo" ? "default" : "secondary"}>{v.estado}</Badge>
                          </div>
                        )) : <span className="text-muted-foreground">—</span>}
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Largar</p>
                        {largar.length ? largar.map((v) => (
                          <div key={v.id} className="flex items-center gap-2">
                            <span>{v.passageiros?.nome}</span>
                            <Badge variant={v.estado === "concluida" ? "outline" : "secondary"}>{v.estado}</Badge>
                          </div>
                        )) : <span className="text-muted-foreground">—</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
              {!paragens.length && <p className="text-sm text-muted-foreground">Esta rota ainda não tem paragens.</p>}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
