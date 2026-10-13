import {
  createFileRoute,
  Outlet,
  Link,
  useNavigate,
} from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import React, { Component, useEffect, useState } from "react";
import { Menu, Navigation, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useSessao, type Papel } from "@/lib/useSessao";
import { SinoNotificacoes } from "@/components/SinoNotificacoes";

type Rota = "/admin" | "/operador" | "/motorista" | "/passageiro" | "/grupo";

const PAPEIS_VALIDOS: Papel[] = [
  "admin",
  "operador",
  "motorista",
  "passageiro",
  "responsavel_grupo",
];

const ROTA_POR_PAPEL: Record<Papel, Rota> = {
  admin: "/admin",
  operador: "/operador",
  motorista: "/motorista",
  passageiro: "/passageiro",
  responsavel_grupo: "/grupo",
};

const LINKS_POR_PAPEL: Record<Papel, { to: Rota; label: string }[]> = {
  admin: [
    { to: "/admin", label: "Administrador" },
    { to: "/operador", label: "Operador" },
    { to: "/motorista", label: "Motorista" },
    { to: "/passageiro", label: "Passageiro" },
  ],
  operador: [{ to: "/operador", label: "Operador" }],
  motorista: [{ to: "/motorista", label: "Motorista" }],
  passageiro: [{ to: "/passageiro", label: "Os meus bilhetes" }],
  responsavel_grupo: [{ to: "/grupo", label: "Responsável de Grupo" }],
};

function lerSessao(chave: string): string | null {
  try {
    return typeof window !== "undefined"
      ? window.sessionStorage.getItem(chave)
      : null;
  } catch {
    return null;
  }
}

function gravarSessao(chave: string, valor: string): void {
  try {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(chave, valor);
    }
  } catch {
    // Storage pode estar bloqueado pelo browser.
  }
}

function removerSessao(chave: string): void {
  try {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(chave);
    }
  } catch {
    // Ignorar falhas de storage.
  }
}

function papelValido(papel: string | null): papel is Papel {
  return papel !== null && PAPEIS_VALIDOS.includes(papel as Papel);
}

function rotaPermitidaParaPapel(papel: Papel, pathname: string): boolean {
  if (papel === "admin") {
    return (
      pathname === "/admin" ||
      pathname.startsWith("/admin/") ||
      pathname === "/operador" ||
      pathname.startsWith("/operador/") ||
      pathname === "/motorista" ||
      pathname.startsWith("/motorista/") ||
      pathname === "/passageiro" ||
      pathname.startsWith("/passageiro/")
    );
  }

  if (papel === "operador") {
    return pathname === "/operador" || pathname.startsWith("/operador/");
  }
  if (papel === "motorista") {
    return pathname === "/motorista" || pathname.startsWith("/motorista/");
  }
  if (papel === "passageiro") {
    return pathname === "/passageiro" || pathname.startsWith("/passageiro/");
  }
  if (papel === "responsavel_grupo") {
    return pathname === "/grupo" || pathname.startsWith("/grupo/");
  }
  return false;
}

export const Route = createFileRoute("/_authenticated")({
  // Todas as áreas autenticadas dependem do Supabase/browser storage.
  // Mantemos este grupo client-only para impedir erros de SSR/hidratação.
  ssr: false,
  pendingMs: 0,
  pendingComponent: AuthenticatedPending,
  component: Layout,
});

function AuthenticatedPending() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="rounded-2xl border bg-white px-8 py-7 text-center shadow-sm">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />
        <p className="mt-4 text-sm font-semibold text-slate-900">A carregar a área...</p>
        <p className="mt-1 text-xs text-slate-500">A verificar a sessão e preparar o painel.</p>
      </div>
    </div>
  );
}

class SafeNotifications extends Component<
  { userId: string },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[notificacoes] componente isolado:", error);
  }

  render() {
    if (this.state.failed) return null;
    return <SinoNotificacoes userId={this.props.userId} />;
  }
}

function Layout() {
  const { data, isLoading, isError, error } = useSessao();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [menuMobileAberto, setMenuMobileAberto] = useState(false);

  const pathname =
    typeof window !== "undefined" ? window.location.pathname : "/";

  const papelAtual: Papel | null = (() => {
    if (!data?.papeis?.length) return null;

    // A rota explícita tem prioridade quando o utilizador possui esse papel.
    // Assim, abrir /admin no preview não herda um papel antigo do browser.
    const papelDiretoPorRota: Array<[Rota, Papel]> = [
      ["/admin", "admin"],
      ["/operador", "operador"],
      ["/motorista", "motorista"],
      ["/passageiro", "passageiro"],
      ["/grupo", "responsavel_grupo"],
    ];
    const rotaDireta = papelDiretoPorRota.find(([rota]) =>
      pathname === rota || pathname.startsWith(rota + "/")
    );
    const papelDaRota = rotaDireta?.[1];

    if (papelDaRota && data.papeis.includes(papelDaRota)) {
      return papelDaRota;
    }

    if (data.papeis.length === 1) return data.papeis[0] ?? null;

    const armazenado = lerSessao("papel_sessao");
    return papelValido(armazenado) && data.papeis.includes(armazenado)
      ? armazenado
      : null;
  })();

  useEffect(() => {
    if (isLoading) return;

    if (isError || !data?.user) {
      console.error("[auth-layout] sessão indisponível:", error);
      navigate({ to: "/auth", replace: true });
      return;
    }

    if (!data.papeis.length) {
      removerSessao("papel_sessao");
      removerSessao("papeis_disponiveis");
      navigate({ to: "/auth", replace: true });
      return;
    }

    // Aceder directamente a uma área pelo URL deve respeitar o papel
    // correspondente quando esse papel existe na conta. Isto evita que
    // /admin seja imediatamente enviado para /passageiro por uma escolha
    // antiga guardada no sessionStorage.
    const papelDiretoPorRota: Array<[Rota, Papel]> = [
      ["/admin", "admin"],
      ["/operador", "operador"],
      ["/motorista", "motorista"],
      ["/passageiro", "passageiro"],
      ["/grupo", "responsavel_grupo"],
    ];

    const rotaDireta = papelDiretoPorRota.find(([rota]) =>
      pathname === rota || pathname.startsWith(rota + "/")
    );
    const papelDaRota = rotaDireta?.[1];

    if (papelDaRota && data.papeis.includes(papelDaRota)) {
      if (papelAtual !== papelDaRota) {
        gravarSessao("papel_sessao", papelDaRota);
        // Não redireccionar para outra área: a rota pedida pelo utilizador é válida.
      }
      return;
    }

    if (!papelAtual) {
      gravarSessao("papeis_disponiveis", JSON.stringify(data.papeis));
      navigate({ to: "/selecionar-papel", replace: true });
      return;
    }

    if (!rotaPermitidaParaPapel(papelAtual, pathname)) {
      navigate({ to: ROTA_POR_PAPEL[papelAtual], replace: true });
    }
  }, [isLoading, isError, data, error, papelAtual, pathname, navigate]);

  function fecharMenuMobile() {
    setMenuMobileAberto(false);
  }

  function trocarPapel() {
    if (!data?.papeis || data.papeis.length <= 1) return;
    removerSessao("papel_sessao");
    gravarSessao("papeis_disponiveis", JSON.stringify(data.papeis));
    fecharMenuMobile();
    navigate({ to: "/selecionar-papel", replace: true });
  }

  async function sair() {
    removerSessao("papel_sessao");
    removerSessao("papeis_disponiveis");
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    fecharMenuMobile();
    navigate({ to: "/auth", replace: true });
  }

  if (isLoading || isError || !data?.user || !papelAtual) {
    return <AuthenticatedPending />;
  }

  const links = LINKS_POR_PAPEL[papelAtual];
  const suspenso = data.activo === false;

  return (
    <div className="min-h-screen bg-secondary">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/95 text-white shadow-lg backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-3 py-2 sm:px-4 sm:py-3">
          <div className="flex min-h-11 items-center gap-2 sm:gap-3">
            <Link
              to="/"
              className="flex min-w-0 flex-1 items-center gap-2.5 truncate text-sm font-semibold tracking-tight text-white sm:text-base"
              onClick={fecharMenuMobile}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/10">
                <Navigation className="h-4 w-4 text-white" />
              </span>
              <span className="truncate text-white">PickApp Mobility</span>
            </Link>

            <nav className="hidden min-w-0 flex-1 flex-wrap items-center gap-1 text-sm md:flex">
              {links.map((l) => (
                <NavLink key={l.to} to={l.to}>
                  {l.label}
                </NavLink>
              ))}
            </nav>

            <span className="hidden max-w-36 truncate rounded-md bg-sidebar-accent px-2.5 py-1.5 text-xs font-medium sm:inline-flex sm:max-w-none">
              {papelAtual === "admin" && "Administrador"}
              {papelAtual === "operador" && "Operador"}
              {papelAtual === "motorista" && "Motorista"}
              {papelAtual === "passageiro" && "Passageiro"}
              {papelAtual === "responsavel_grupo" && "Resp. Grupo"}
            </span>

            {data.papeis.length > 1 && (
              <Button
                size="sm"
                variant="outline"
                className="hidden shrink-0 border-white/30 bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent/80 hover:text-sidebar-foreground sm:inline-flex"
                onClick={trocarPapel}
              >
                Trocar conta
              </Button>
            )}

            <SafeNotifications userId={data.user.id} />

            <Button
              size="sm"
              variant="secondary"
              className="hidden sm:inline-flex"
              onClick={() => void sair()}
            >
              Sair
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="min-h-11 min-w-11 shrink-0 !text-white hover:!bg-sidebar-accent md:hidden"
              onClick={() => setMenuMobileAberto((v) => !v)}
              aria-label={menuMobileAberto ? "Fechar menu" : "Abrir menu"}
              aria-expanded={menuMobileAberto}
            >
              {menuMobileAberto ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </Button>
          </div>

          <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-0.5 sm:hidden">
            <span className="shrink-0 rounded-md bg-sidebar-accent px-2.5 py-1.5 text-xs font-medium">
              {papelAtual === "admin" && "Administrador"}
              {papelAtual === "operador" && "Operador"}
              {papelAtual === "motorista" && "Motorista"}
              {papelAtual === "passageiro" && "Passageiro"}
              {papelAtual === "responsavel_grupo" && "Resp. Grupo"}
            </span>

            {data.papeis.length > 1 && (
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 border-white/30 bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent/80 hover:text-sidebar-foreground"
                onClick={trocarPapel}
              >
                Trocar papel
              </Button>
            )}

            <Button
              size="sm"
              variant="secondary"
              className="ml-auto shrink-0"
              onClick={() => void sair()}
            >
              Sair
            </Button>
          </div>

          {menuMobileAberto && (
            <div className="mt-2 border-t border-sidebar-border pt-2 md:hidden">
              <nav className="grid gap-1">
                {links.map((l) => (
                  <NavLink key={l.to} to={l.to} onNavigate={fecharMenuMobile}>
                    {l.label}
                  </NavLink>
                ))}
              </nav>
            </div>
          )}
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-6xl overflow-x-hidden px-3 py-5 sm:px-4 sm:py-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-0 overflow-hidden opacity-[0.13]"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=1800&q=80')",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="relative z-10">
          {suspenso ? (
            <div className="mx-auto max-w-md rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-center">
              <h1 className="text-lg font-semibold text-destructive">Conta suspensa</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                O acesso a esta conta foi suspenso por um administrador. Contacta o suporte se achares que isto é um engano.
              </p>
            </div>
          ) : (
            <Outlet />
          )}
        </div>
      </main>
    </div>
  );
}

function NavLink({
  to,
  children,
  onNavigate,
}: {
  to: Rota;
  children: React.ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className="rounded-md px-3 py-2 text-white transition-colors hover:bg-sidebar-accent hover:text-white md:py-1.5"
      activeProps={{
        className: "rounded-md bg-sidebar-accent px-3 py-1.5 text-white",
      }}
    >
      {children}
    </Link>
  );
}
