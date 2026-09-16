import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { obterBilhete } from "@/lib/mobilidade.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/p/$token")({
  head: () => ({
    meta: [
      { title: "O seu bilhete QR — Rotas & Embarque QR" },
      { name: "description", content: "Apresente este QR Code ao motorista para confirmar o embarque." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "O seu bilhete QR" },
      { property: "og:description", content: "Apresente este QR Code ao motorista para confirmar o embarque." },
    ],
  }),
  component: BilhetePage,
});

const ESTADOS: Record<string, string> = {
  pendente: "Pendente",
  a_bordo: "A bordo",
  concluida: "Concluída",
  recusada: "Recusada",
};

function BilhetePage() {
  const { token } = Route.useParams();
  const [qr, setQr] = useState<string>("");

  const { data, isLoading } = useQuery({
    queryKey: ["bilhete", token],
    queryFn: () => obterBilhete({ data: { token } }),
  });

  useEffect(() => {
    QRCode.toDataURL(token, { width: 520, margin: 1, color: { dark: "#1b2540", light: "#ffffff" } }).then(setQr);
  }, [token]);

  if (isLoading) return <div className="p-10 text-center text-muted-foreground">A carregar…</div>;

  if (!data)
    return (
      <main className="flex min-h-screen items-center justify-center bg-secondary px-4">
        <Card className="max-w-sm text-center">
          <CardContent className="py-10">
            <h1 className="text-lg font-semibold">Bilhete não encontrado</h1>
            <p className="mt-2 text-sm text-muted-foreground">Confirme a ligação recebida do operador.</p>
          </CardContent>
        </Card>
      </main>
    );

  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary px-4 py-10">
      <Card className="w-full max-w-sm" style={{ boxShadow: "var(--shadow-panel)" }}>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">{data.passageiro}</CardTitle>
          <p className="text-sm text-muted-foreground">{data.rota}</p>
        </CardHeader>
        <CardContent className="space-y-5 text-center">
          {qr && <img src={qr} alt="QR Code de embarque" className="mx-auto w-full max-w-[280px] rounded-lg border" />}
          <div className="space-y-1 text-sm">
            <p className="font-medium">
              Embarque: {data.paragemEmbarque ?? "—"}
              {data.horaEmbarque ? ` · ${data.horaEmbarque.slice(0, 5)}` : ""}
            </p>
            <p className="text-muted-foreground">Desembarque: {data.paragemDesembarque ?? "—"}</p>
            {data.veiculo && <p className="text-muted-foreground">Veículo: {data.veiculo}</p>}
          </div>
          <Badge variant={data.estado === "a_bordo" ? "default" : "secondary"}>{ESTADOS[data.estado]}</Badge>
          <p className="text-xs text-muted-foreground">Apresente este código ao motorista à entrada do veículo.</p>
        </CardContent>
      </Card>
    </main>
  );
}
