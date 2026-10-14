import { useCallback, useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "@/integrations/supabase/client";

export type PosVeiculo = {
  id: string;
  nome: string;
  latitude: number | null;
  longitude: number | null;
  estado?: string | null;
  posicao_updated_at?: string | null;
};

export type PosParagem = {
  id: string;
  nome: string;
  ordem: number;
  latitude: number | null;
  longitude: number | null;
  destaque?: boolean;
};

type Ponto = [number, number];

const CENTRO_OMISSAO: Ponto = [-25.9655, 32.5832]; // Maputo

const CORES: Record<string, string> = {
  em_rota: "hsl(142 72% 35%)",
  incidente: "hsl(0 72% 45%)",
  inactivo: "hsl(215 16% 47%)",
};

function iconeVeiculo(estado?: string | null) {
  const cor = CORES[estado ?? "inactivo"] ?? CORES["inactivo"];
  return L.divIcon({
    className: "",
    html: `<div style="background:#fff;width:30px;height:30px;border-radius:10px;border:2px solid ${cor};box-shadow:0 2px 8px #0003;display:flex;align-items:center;justify-content:center;font-size:18px;line-height:1">🚌</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function iconeParagem(ordem: number, destaque?: boolean) {
  const cor = destaque ? "hsl(38 92% 50%)" : "hsl(217 60% 25%)";
  return L.divIcon({
    className: "",
    html: `<div style="background:${cor};color:#fff;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:600 11px/1 system-ui;border:2px solid #fff">${ordem}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function AjustarVista({ pontos, seguirVeiculo }: { pontos: Ponto[]; seguirVeiculo: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (seguirVeiculo || !pontos.length) return;
    if (pontos.length === 1) {
      const [unico] = pontos;
      if (unico) map.setView(unico, 14);
    } else {
      map.fitBounds(L.latLngBounds(pontos), { padding: [32, 32] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, JSON.stringify(pontos), seguirVeiculo]);
  return null;
}

function CliqueMapa({ onClique }: { onClique: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => onClique(e.latlng.lat, e.latlng.lng),
  });
  return null;
}

type ResultadoPesquisa = { place_id: string; display_name: string; lat: string; lon: string; origem: "guardado" | "mapa"; verificado?: boolean };

function GuardarMapa({ onReady }: { onReady: (map: LeafletMap) => void }) {
  const map = useMap();
  useEffect(() => { onReady(map); }, [map, onReady]);
  return null;
}

function SeguirVeiculo({ posicao, activo }: { posicao: Ponto | null; activo: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (activo && posicao) map.panTo(posicao, { animate: true, duration: 0.5 });
  }, [map, activo, posicao?.[0], posicao?.[1]]);
  return null;
}

function iconePesquisa() {
  return L.divIcon({
    className: "",
    html: '<div style="background:#2563eb;width:20px;height:20px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 8px #0005"></div>',
    iconSize: [20, 20],
    iconAnchor: [10, 20],
  });
}

export default function MapaVeiculos({
  veiculos = [],
  paragens = [],
  tracado = false,
  altura = 280,
  onCliqueMapa,
  objetivoVeiculoId,
}: {
  veiculos?: PosVeiculo[];
  paragens?: PosParagem[];
  tracado?: boolean;
  altura?: number;
  onCliqueMapa?: (lat: number, lng: number) => void;
  /** Paragem que o veículo está a alcançar neste momento. */
  objetivoVeiculoId?: string;
}) {
  const vs = veiculos.filter(
    (v): v is PosVeiculo & { latitude: number; longitude: number } => v.latitude != null && v.longitude != null,
  );
  const ps = [...paragens]
    .filter((p): p is PosParagem & { latitude: number; longitude: number } => p.latitude != null && p.longitude != null)
    .sort((a, b) => a.ordem - b.ordem);

  const pontosVeiculos: Ponto[] = vs.map((v) => [v.latitude, v.longitude]);
  const pontosParagens: Ponto[] = ps.map((p) => [p.latitude, p.longitude]);

  const pontos = useMemo<Ponto[]>(
    () => [...pontosVeiculos, ...pontosParagens],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(pontosVeiculos), JSON.stringify(pontosParagens)],
  );

  const centro: Ponto = pontos[0] ?? CENTRO_OMISSAO;
  const veiculoEmSeguimento = vs[0];
  const objetivo = ps.find((p) => p.id === objetivoVeiculoId);
  const [percursoActivo, setPercursoActivo] = useState<Ponto[]>([]);
  const [estimativaPercurso, setEstimativaPercurso] = useState<{ distanciaMetros: number; duracaoSegundos: number } | null>(null);
  const [mapa, setMapa] = useState<LeafletMap | null>(null);
  const [pesquisa, setPesquisa] = useState("");
  const [resultadosPesquisa, setResultadosPesquisa] = useState<ResultadoPesquisa[]>([]);
  const [pesquisando, setPesquisando] = useState(false);
  const [mensagemPesquisa, setMensagemPesquisa] = useState("");
  const [localPesquisado, setLocalPesquisado] = useState<Ponto | null>(null);
  const guardarMapa = useCallback((instancia: LeafletMap) => setMapa(instancia), []);
  const procurarLocal = async () => {
    const termo = pesquisa.trim();
    if (!termo) {
      setResultadosPesquisa([]);
      setMensagemPesquisa("Introduza o nome de um local para pesquisar.");
      return;
    }
    setPesquisando(true);
    setMensagemPesquisa("");
    try {
      // Primeiro pesquisar os pontos já guardados. A existência de coordenadas
      // não deve impedir a pesquisa pelo nome.
      const { data: guardados, error: erroGuardados } = await supabase
        .from("pontos_predefinidos")
        .select("id, nome, latitude, longitude, coordenadas_verificadas")
        .eq("activo", true)
        .ilike("nome", `%${termo.replace(/[%_]/g, "\\$&")}%`)
        .order("nome")
        .limit(10);
      if (erroGuardados) console.warn("[mapa] não foi possível pesquisar pontos guardados:", erroGuardados.message);

      const locaisGuardados: ResultadoPesquisa[] = (guardados ?? [])
        .filter((p) => p.latitude != null && p.longitude != null)
        .map((p) => ({
          place_id: `guardado-${p.id}`,
          display_name: p.nome,
          lat: String(p.latitude),
          lon: String(p.longitude),
          origem: "guardado" as const,
          verificado: Boolean(p.coordenadas_verificadas),
        }));

      let locaisExternos: ResultadoPesquisa[] = [];
      try {
        const params = new URLSearchParams({ format: "jsonv2", q: termo, limit: "5", countrycodes: "mz" });
        const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
          headers: { Accept: "application/json" },
        });
        if (response.ok) {
          const dados = await response.json() as { place_id: number; display_name: string; lat: string; lon: string }[];
          locaisExternos = dados.map((p) => ({ ...p, place_id: `mapa-${p.place_id}`, origem: "mapa" as const }));
        }
      } catch (error) {
        console.warn("[mapa] pesquisa externa indisponível:", error);
      }

      const combinados = [...locaisGuardados, ...locaisExternos];
      setResultadosPesquisa(combinados);
      if (!combinados.length) setMensagemPesquisa("Nenhum local encontrado. Verifique a escrita ou tente um nome mais específico.");
      else setMensagemPesquisa(`${combinados.length} resultado(s). Seleccione um local para centrar o mapa.`);
    } catch (error) {
      setResultadosPesquisa([]);
      setMensagemPesquisa("Não foi possível pesquisar locais agora. Verifique a ligação e tente novamente.");
      console.error("[mapa] pesquisa:", error);
    } finally {
      setPesquisando(false);
    }
  };
  const escolherLocal = (local: ResultadoPesquisa) => {
    const ponto: Ponto = [Number(local.lat), Number(local.lon)];
    setLocalPesquisado(ponto);
    setPesquisa(local.display_name);
    setResultadosPesquisa([]);
    setMensagemPesquisa(local.origem === "guardado" ? (local.verificado ? "Ponto guardado verificado." : "Ponto guardado ainda não verificado.") : "Local encontrado no mapa; confirme a posição antes de o usar numa rota.");
    mapa?.setView(ponto, 16, { animate: true });
  };
  // Recalcula a rota rodoviária a cada ~100 m, sem sobrecarregar o serviço público de rotas.
  const origemRotaLat = veiculoEmSeguimento ? Math.round(veiculoEmSeguimento.latitude * 1000) / 1000 : null;
  const origemRotaLng = veiculoEmSeguimento ? Math.round(veiculoEmSeguimento.longitude * 1000) / 1000 : null;

  // Desenha o percurso rodoviário entre a posição GPS actual e a próxima paragem.
  // Se o serviço de rotas estiver indisponível, mantém uma linha directa como fallback.
  useEffect(() => {
    if (!veiculoEmSeguimento || !objetivo || !objetivoVeiculoId) {
      setPercursoActivo([]);
      return;
    }
    const origem: Ponto = [veiculoEmSeguimento.latitude, veiculoEmSeguimento.longitude];
    const destino: Ponto = [objetivo.latitude, objetivo.longitude];
    setPercursoActivo([origem, destino]);
    setEstimativaPercurso(null);
    const controller = new AbortController();
    const url = `https://router.project-osrm.org/route/v1/driving/${veiculoEmSeguimento.longitude},${veiculoEmSeguimento.latitude};${objetivo.longitude},${objetivo.latitude}?overview=full&geometries=geojson`;
    fetch(url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Serviço de rotas indisponível");
        return response.json();
      })
      .then((data: { routes?: { distance?: number; duration?: number; geometry?: { coordinates?: [number, number][] } }[] }) => {
        const route = data.routes?.[0];
        const coords = route?.geometry?.coordinates;
        if (coords && coords.length > 1) setPercursoActivo(coords.map(([lng, lat]): Ponto => [lat, lng]));
        if (typeof route?.distance === "number" && typeof route.duration === "number") {
          setEstimativaPercurso({ distanciaMetros: route.distance, duracaoSegundos: route.duration });
        }
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        // O fallback directo já foi colocado no estado acima.
        setEstimativaPercurso(null);
      });
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    objetivoVeiculoId,
    veiculoEmSeguimento?.id,
    origemRotaLat,
    origemRotaLng,
    objetivo?.latitude,
    objetivo?.longitude,
  ]);

  return (
    <div className="space-y-2">
    <div className="relative overflow-hidden rounded-lg border" style={{ height: altura }}>
      <MapContainer
        center={centro}
        zoom={pontos.length ? 13 : 12}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={true}
        zoomAnimation={false}
        fadeAnimation={false}
        markerZoomAnimation={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · <a href="https://www.openstreetmap.org/fixthemap">Reportar erro no mapa</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <GuardarMapa onReady={guardarMapa} />
        <AjustarVista pontos={pontos} seguirVeiculo={Boolean(objetivoVeiculoId)} />
        <SeguirVeiculo
          posicao={veiculoEmSeguimento ? [veiculoEmSeguimento.latitude, veiculoEmSeguimento.longitude] : null}
          activo={Boolean(objetivoVeiculoId)}
        />
        {localPesquisado && (
          <Marker position={localPesquisado} icon={iconePesquisa()}>
            <Popup>Local pesquisado</Popup>
          </Marker>
        )}
        {onCliqueMapa && <CliqueMapa onClique={onCliqueMapa} />}
        {tracado && pontosParagens.length > 1 && (
          <Polyline positions={pontosParagens} pathOptions={{ color: "hsl(217 60% 35%)", weight: 3, opacity: 0.55, dashArray: "7 6" }} />
        )}
        {objetivoVeiculoId && percursoActivo.length > 1 && (
          <Polyline positions={percursoActivo} pathOptions={{ color: "hsl(142 72% 35%)", weight: 5, opacity: 0.9 }} />
        )}
        {ps.map((p) => (
          <Marker key={p.id} position={[p.latitude, p.longitude]} icon={iconeParagem(p.ordem, p.destaque)}>
            <Popup>
              {p.ordem}. {p.nome}
            </Popup>
          </Marker>
        ))}
        {vs.map((v) => (
          <Marker key={v.id} position={[v.latitude, v.longitude]} icon={iconeVeiculo(v.estado)}>
            <Popup>
              <strong>{v.nome}</strong>
              <br />
              {v.estado ?? "inactivo"}
              {v.posicao_updated_at && (
                <>
                  <br />
                  {new Date(v.posicao_updated_at).toLocaleTimeString("pt-PT")}
                </>
              )}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      <div className="absolute left-3 right-3 top-3 z-[1000] max-w-sm space-y-1">
        <form
          className="flex gap-1 rounded-xl border bg-white/95 p-1 shadow-lg backdrop-blur"
          onSubmit={(event) => { event.preventDefault(); void procurarLocal(); }}
        >
          <input
            aria-label="Pesquisar local no mapa"
            className="h-10 min-w-0 flex-1 bg-transparent px-3 text-sm text-slate-900 outline-none placeholder:text-slate-500"
            value={pesquisa}
            onChange={(event) => setPesquisa(event.target.value)}
            placeholder="Pesquisar local ou morada…"
          />
          <button
            type="submit"
            disabled={pesquisando || !pesquisa.trim()}
            className="rounded-lg bg-blue-600 px-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {pesquisando ? "…" : "Pesquisar"}
          </button>
        </form>
        {resultadosPesquisa.length > 0 && (
          <div className="max-h-44 overflow-y-auto rounded-xl border bg-white shadow-lg">
            {resultadosPesquisa.map((local) => (
              <button
                key={local.place_id}
                type="button"
                className="block w-full border-b px-3 py-2 text-left text-xs text-slate-800 last:border-0 hover:bg-slate-100"
                onClick={() => escolherLocal(local)}
              >
                <span className="block font-medium">{local.display_name}</span>
                <span className="mt-0.5 block text-[10px] text-slate-500">{local.origem === "guardado" ? (local.verificado ? "Ponto guardado · coordenadas verificadas" : "Ponto guardado · coordenadas por verificar") : "Resultado do mapa · não é um ponto guardado"}</span>
              </button>
            ))}
          </div>
        )}
        {mensagemPesquisa && <p role="status" className="rounded-lg border bg-white/95 px-3 py-2 text-xs text-slate-700 shadow">{mensagemPesquisa}</p>}
      </div>
    </div>
    {objetivo && objetivoVeiculoId && (
      <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Próxima paragem: {objetivo.nome}</span>
        {estimativaPercurso
          ? ` · ${(estimativaPercurso.distanciaMetros / 1000).toLocaleString("pt-PT", { maximumFractionDigits: 1 })} km · cerca de ${Math.max(1, Math.round(estimativaPercurso.duracaoSegundos / 60))} min, estimativa sem trânsito em tempo real`
          : " · percurso rodoviário aproximado; sem dados de trânsito em tempo real"}
      </div>
    )}
    </div>
  );
}
