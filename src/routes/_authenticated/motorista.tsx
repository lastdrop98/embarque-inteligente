import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { validarQr, type ResultadoScan } from "@/lib/mobilidade.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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

function MotoristaPage() {
  const qc = useQueryClient();
  const validar = useServerFn(validarQr);
  const [rotaId, setRotaId] = useState("");
  const [paragemId, setParagemId] = useState("");
  const [token, setToken] = useState("");
  const [tipo, setTipo] = useState<"embarque" | "desembarque">("embarque");
  const [resultado, setResultado] = useState<ResultadoScan | null>(null);
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);

  const { data: rotas } = useQuery({
    queryKey: ["minhas-rotas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rotas")
        .select("id, nome, veiculos(nome, lugares), paragens(id, nome, ordem, hora_prevista)")
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const rota = rotas?.find((r) => r.id === rotaId) ?? rotas?.[0];
  const paragens = [...(rota?.paragens ?? [])].sort((a, b) => a.ordem - b.ordem);

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

  async function pararScan() {
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); scannerRef.current.clear(); } catch { /* ignorar */ }
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ecrã do Motorista</h1>
        <p className="text-sm text-muted-foreground">Rota atribuída e validação de embarques.</p>
      </div>

      {!rotas?.length && <p className="text-sm text-muted-foreground">Ainda não tem rotas atribuídas.</p>}

      {rota && (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">Rota</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Rota</Label>
                <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={rota.id} onChange={(e) => { setRotaId(e.target.value); setParagemId(""); }}>
                  {rotas?.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
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
                  <Button type="button" variant={tipo === "embarque" ? "default" : "outline"} onClick={() => setTipo("embarque")}>Embarque</Button>
                  <Button type="button" variant={tipo === "desembarque" ? "default" : "outline"} onClick={() => setTipo("desembarque")}>Desembarque</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Leitura de QR Code</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {scanning
                  ? <Button variant="destructive" onClick={pararScan}>Parar scan</Button>
                  : <Button onClick={iniciarScan}>Abrir leitor (Scan)</Button>}
              </div>
              <div id="leitor-qr" className={scanning ? "mx-auto max-w-sm overflow-hidden rounded-lg border" : "hidden"} />
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[240px] flex-1 space-y-2">
                  <Label>Ou introduza o código manualmente</Label>
                  <Input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Token do bilhete" />
                </div>
                <Button variant="secondary" disabled={!token} onClick={() => submeter()}>Validar</Button>
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
