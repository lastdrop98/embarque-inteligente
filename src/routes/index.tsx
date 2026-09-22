import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  BusFront,
  CheckCircle2,
  Navigation,
  QrCode,
  Route as RouteIcon,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "PickApp Mobility — Embarque Inteligente" },
      {
        name: "description",
        content:
          "Gestão inteligente de mobilidade, rotas e embarques por QR Code.",
      },
    ],
  }),
});

function Index() {
  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <section
        className="relative isolate overflow-hidden px-4 pb-20 pt-6 text-primary-foreground sm:px-6 sm:pb-28 sm:pt-8"
        style={{ backgroundImage: "var(--gradient-navy)" }}
      >
        <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_20%_20%,white_0,transparent_32%),radial-gradient(circle_at_80%_10%,white_0,transparent_28%)]" />
        <header className="relative mx-auto flex max-w-6xl items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-3 font-semibold tracking-tight">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
              <Navigation className="h-5 w-5" />
            </span>
            <span>PickApp Mobility</span>
          </Link>
          <Button asChild variant="secondary" className="rounded-full px-5 shadow-lg">
            <Link to="/auth">
              Entrar
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </header>

        <div className="relative mx-auto mt-20 max-w-5xl text-center sm:mt-24">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" />
            Mobilidade inteligente em tempo real
          </div>
          <h1 className="mt-6 text-4xl font-bold tracking-[-0.04em] sm:text-6xl lg:text-7xl">
            Embarque mais simples.
            <span className="block opacity-75">Gestão mais inteligente.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-white/75 sm:text-lg">
            Planeie rotas, organize passageiros, acompanhe operações e valide
            cada embarque com QR Code — numa única plataforma.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" variant="secondary" className="h-12 rounded-full px-7 text-base shadow-xl">
              <Link to="/auth">
                Entrar na plataforma
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <a
              href="#recursos"
              className="inline-flex h-12 items-center rounded-full border border-white/20 bg-white/5 px-6 text-sm font-medium text-white/90 backdrop-blur transition hover:bg-white/10"
            >
              Conhecer recursos
            </a>
          </div>
        </div>

        <div className="relative mx-auto mt-16 grid max-w-5xl gap-3 sm:grid-cols-3">
          {[
            { icon: RouteIcon, label: "Rotas organizadas", value: "Paragens + horários" },
            { icon: QrCode, label: "Embarque digital", value: "QR Code único" },
            { icon: ShieldCheck, label: "Controlo operacional", value: "Acesso por papel" },
          ].map((item) => (
            <div key={item.label} className="rounded-3xl border border-white/10 bg-white/[0.07] p-5 text-left backdrop-blur-xl">
              <item.icon className="h-5 w-5" />
              <p className="mt-8 text-sm font-semibold">{item.label}</p>
              <p className="mt-1 text-xs text-white/60">{item.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="recursos" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Uma plataforma, vários papéis</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Cada equipa vê exactamente o que precisa.</h2>
          <p className="mt-4 text-muted-foreground">
            Administração, operação, motoristas, passageiros e responsáveis de grupo trabalham no mesmo fluxo de mobilidade.
          </p>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Users, title: "Passageiros", text: "Consulte viagens e apresente o seu código de embarque." },
            { icon: BusFront, title: "Motoristas", text: "Acompanhe a rota e valide embarques em cada paragem." },
            { icon: RouteIcon, title: "Operadores", text: "Crie rotas, atribua recursos e acompanhe a operação." },
            { icon: Zap, title: "Administradores", text: "Tenha uma visão centralizada de acessos e actividade." },
          ].map((card) => (
            <div
              key={card.title}
              className="group rounded-3xl border bg-card/80 p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-105">
                <card.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 font-semibold">{card.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{card.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-4 mb-8 overflow-hidden rounded-[2rem] border bg-card px-6 py-10 shadow-sm sm:mx-auto sm:max-w-6xl sm:px-10">
        <div className="flex flex-col items-start justify-between gap-7 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <CheckCircle2 className="h-4 w-4" />
              Pronto para começar
            </div>
            <h2 className="mt-2 text-2xl font-bold tracking-tight">Entre no Embarque Inteligente.</h2>
            <p className="mt-2 text-sm text-muted-foreground">Aceda à sua área de trabalho de forma segura.</p>
          </div>
          <Button asChild size="lg" className="rounded-full px-7">
            <Link to="/auth">
              Entrar
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="px-4 pb-8 text-center text-xs text-muted-foreground">
        PickApp Mobility · Embarque Inteligente
      </footer>
    </main>
  );
}
