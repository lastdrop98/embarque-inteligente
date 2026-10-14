import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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

function AjustarVista({ pontos }: { pontos: Ponto[] }) {
  const map = useMap();
  useEffect(() => {
    if (!pontos.length) return;
    if (pontos.length === 1) {
      const [unico] = pontos;
      if (unico) map.setView(unico, 14);
    } else {
      map.fitBounds(L.latLngBounds(pontos), { padding: [32, 32] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, JSON.stringify(pontos)]);
  return null;
}

function CliqueMapa({ onClique }: { onClique: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => onClique(e.latlng.lat, e.latlng.lng),
  });
  return null;
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
    const controller = new AbortController();
    const url = `https://router.project-osrm.org/route/v1/driving/${veiculoEmSeguimento.longitude},${veiculoEmSeguimento.latitude};${objetivo.longitude},${objetivo.latitude}?overview=full&geometries=geojson`;
    fetch(url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Serviço de rotas indisponível");
        return response.json();
      })
      .then((data: { routes?: { geometry?: { coordinates?: [number, number][] } }[] }) => {
        const coords = data.routes?.[0]?.geometry?.coordinates;
        if (coords && coords.length > 1) setPercursoActivo(coords.map(([lng, lat]) => [lat, lng]));
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        // O fallback directo já foi colocado no estado acima.
      });
    return () => controller.abort();
  }, [
    objetivoVeiculoId,
    veiculoEmSeguimento?.id,
    origemRotaLat,
    origemRotaLng,
    objetivo?.latitude,
    objetivo?.longitude,
  ]);

  return (
    <div className="overflow-hidden rounded-lg border" style={{ height: altura }}>
      <MapContainer
        center={centro}
        zoom={pontos.length ? 13 : 12}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={false}
        zoomAnimation={false}
        fadeAnimation={false}
        markerZoomAnimation={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · <a href="https://www.openstreetmap.org/fixthemap">Reportar erro no mapa</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <AjustarVista pontos={pontos} />
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
    </div>
  );
}
