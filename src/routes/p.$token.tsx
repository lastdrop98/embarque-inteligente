import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { obterBilhete } from "@/lib/mobilidade.functions";
import { Card, CardContent } from "@/components/ui/card";
import { BilhetePass } from "@/components/BilhetePass";

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

function BilhetePage() {
  const { token } = Route.useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["bilhete", token],
    queryFn: () => obterBilhete({ data: { token } }),
    refetchInterval: 5000,
  });

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
      <div className="w-full max-w-sm space-y-3">
        <BilhetePass dados={{ ...data, token }} />
        <p className="text-center text-xs text-muted-foreground">
          Apresente este código ao motorista à entrada do veículo. Esta página actualiza-se sozinha.
        </p>
      </div>
    </main>
  );
}
