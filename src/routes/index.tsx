import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Rotas & Embarque QR — Gestão de mobilidade" },
      {
        name: "description",
        content:
          "Gestão de rotas multiponto e check-in de passageiros por QR Code: operadores planeiam, motoristas validam embarques em tempo real.",
      },
      { property: "og:title", content: "Rotas & Embarque QR — Gestão de mobilidade" },
      {
        property: "og:description",
        content: "Rotas multiponto, bilhetes QR por passageiro e validação de embarque em tempo real.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="min-h-screen bg-background">
      <section
        className="px-4 py-24 text-primary-foreground"
        style={{ backgroundImage: "var(--gradient-navy)" }}
      >
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm uppercase tracking-[0.2em] opacity-70">Mobility Command Centre</p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">Rotas &amp; Embarque QR</h1>
          <p className="mt-5 text-lg opacity-85">
            Planeie rotas com paragens ordenadas, atribua passageiros e confirme cada embarque com um QR Code
            pessoal e único.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild size="lg" variant="secondary">
              <Link to="/auth">Entrar</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-6 px-4 py-16 sm:grid-cols-3">
        {[
          { t: "Operador", d: "Cria rotas, paragens e passageiros, e gera o token QR de cada viagem." },
          { t: "Motorista", d: "Vê a rota paragem a paragem e valida embarques e desembarques por QR." },
          { t: "Painel", d: "Mostra quantos passageiros estão a bordo e quantos lugares ficam livres." },
        ].map((c) => (
          <div key={c.t} className="rounded-xl border bg-card p-6" style={{ boxShadow: "var(--shadow-panel)" }}>
            <h2 className="font-semibold text-card-foreground">{c.t}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{c.d}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
