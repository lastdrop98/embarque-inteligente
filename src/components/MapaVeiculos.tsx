import { useEffect, useMemo } from "react";
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

const CORES: Record<string, string> = {
  em_rota: "hsl(142 72% 35%)",
  incidente: "hsl(0 72% 45%)",
  inactivo: "hsl(215 16% 47%)",
};

function iconeVeiculo(estado?: string | null) {
  const cor = CORES[estado ?? "inactivo"] ?? CORES.inactivo;
  return L.divIcon({
    className: "",
    html: `<div style="background:${cor};width:18px;height:18px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 2px ${cor}55"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
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

function AjustarVista({ pontos }: { pontos: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (!pontos.length) return;
    if (pontos.length === 1) map.setView(pontos[0], 14);
    else map.fitBounds(L.latLngBounds(pontos), { padding: [32, 32] });
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
}: {
  veiculos?: PosVeiculo[];
  paragens?: PosParagem[];
  tracado?: boolean;
  altura?: number;
  onCliqueMapa?: (lat: number, lng: number) => void;
}) {
  const vs = veiculos.filter((v) => v.latitude != null && v.longitude != null);
  const ps = [...paragens].filter((p) => p.latitude != null && p.longitude != null).sort((a, b) => a.ordem - b.ordem);

  const pontos = useMemo<[number, number][]>(
    () => [
      ...vs.map((v) => [v.latitude as number, v.longitude as number] as [number, number]),
      ...ps.map((p) => [p.latitude as number, p.longitude as number] as [number, number]),
    ],
    [vs, ps],
  );

  return (
    <div className="overflow-hidden rounded-lg border" style={{ height: altura }}>
      <MapContainer
        center={pontos[0] ?? [38.7223, -9.1393]}
        zoom={pontos.length ? 13 : 6}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <AjustarVista pontos={pontos} />
        {onCliqueMapa && <CliqueMapa onClique={onCliqueMapa} />}
        {tracado && ps.length > 1 && (
          <Polyline
            positions={ps.map((p) => [p.latitude as number, p.longitude as number] as [number, number])}
            pathOptions={{ color: "hsl(217 60% 35%)", weight: 3, opacity: 0.7 }}
          />
        )}
        {ps.map((p) => (
          <Marker
            key={p.id}
            position={[p.latitude as number, p.longitude as number]}
            icon={iconeParagem(p.ordem, p.destaque)}
          >
            <Popup>
              {p.ordem}. {p.nome}
            </Popup>
          </Marker>
        ))}
        {vs.map((v) => (
          <Marker
            key={v.id}
            position={[v.latitude as number, v.longitude as number]}
            icon={iconeVeiculo(v.estado)}
          >
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
