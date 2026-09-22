import {
  createFileRoute,
  Outlet,
  redirect,
  Link,
  useNavigate,
} from "@tanstack/react-router";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Menu, Navigation, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";

import {
  useSessao,
  type Papel,
} from "@/lib/useSessao";

import { SinoNotificacoes } from "@/components/SinoNotificacoes";

type Rota =
  | "/admin"
  | "/operador"
  | "/motorista"
  | "/passageiro"
  | "/grupo";

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

const LINKS_POR_PAPEL: Record<
  Papel,
  { to: Rota; label: string }[]
> = {
  admin: [
    {
      to: "/admin",
      label: "Administrador",
    },
    {
      to: "/operador",
      label: "Operador",
    },
    {
      to: "/motorista",
      label: "Motorista",
    },
    {
      to: "/passageiro",
      label: "Passageiro",
    },
  ],

  operador: [
    {
      to: "/operador",
      label: "Operador",
    },
  ],

  motorista: [
    {
      to: "/motorista",
      label: "Motorista",
    },
  ],

  passageiro: [
    {
      to: "/passageiro",
      label: "Os meus bilhetes",
    },
  ],

  responsavel_grupo: [
    {
      to: "/grupo",
      label: "Responsável de Grupo",
    },
  ],
};

function papelValido(
  papel: string | null
): papel is Papel {
  return (
    papel !== null &&
    PAPEIS_VALIDOS.includes(
      papel as Papel
    )
  );
}

function rotaPermitidaParaPapel(
  papel: Papel,
  pathname: string
): boolean {
  /*
   * ADMINISTRADOR:
   *
   * O administrador possui acesso global
   * às áreas protegidas da plataforma.
   *
   * A escolha do papel continua explícita:
   * se o administrador escolher "Administrador",
   * a sessão fica em modo administrativo e
   * pode navegar pelas outras áreas.
   */
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

  switch (papel) {
    case "operador":
      return (
        pathname === "/operador" ||
        pathname.startsWith("/operador/")
      );

    case "motorista":
      return (
        pathname === "/motorista" ||
        pathname.startsWith("/motorista/")
      );

    case "passageiro":
      return (
        pathname === "/passageiro" ||
        pathname.startsWith("/passageiro/")
      );

    case "responsavel_grupo":
      return pathname === "/grupo" || pathname.startsWith("/grupo/");

    default:
      return false;
  }
}

function redirecionarParaPapel(
  papel: Papel
): never {
  const rota = ROTA_POR_PAPEL[papel];

  switch (rota) {
    case "/admin":
      throw redirect({
        to: "/admin",
      });

    case "/operador":
      throw redirect({
        to: "/operador",
      });

    case "/motorista":
      throw redirect({
        to: "/motorista",
      });

    case "/passageiro":
      throw redirect({
        to: "/passageiro",
      });

    case "/grupo":
      throw redirect({
        to: "/grupo",
      });
  }
}

export const Route = createFileRoute(
  "/_authenticated"
)({
  ssr: false,
  pendingMs: 0,
  pendingComponent: AuthenticatedPending,

  beforeLoad: async ({ location }) => {
    const {
      data,
      error,
    } = await supabase.auth.getUser();

    if (error || !data.user) {
      throw redirect({
        to: "/auth",
      });
    }

    const {
      data: papeis,
      error: papelError,
    } = await supabase
      .from("papeis_utilizador")
      .select("role")
      .eq("user_id", data.user.id);

    if (papelError) {
      console.error(
        "[route] erro ao obter papéis:",
        papelError
      );

      throw redirect({
        to: "/auth",
      });
    }

    const roles: Papel[] = [
      ...new Set(
        (papeis ?? [])
          .map((p) => p.role as string)
          .filter((role): role is Papel =>
            papelValido(role)
          )
      ),
    ];

    /*
     * Conta sem qualquer papel:
     * não permitimos acesso.
     */
    if (roles.length === 0) {
      console.error(
        "[route] utilizador sem papel:",
        data.user.id
      );

      sessionStorage.removeItem(
        "papel_sessao"
      );

      throw redirect({
        to: "/auth",
      });
    }

    let papelSessao: Papel | null = null;

    /*
     * Apenas um papel:
     * entra directamente nesse papel.
     */
    if (roles.length === 1) {
      const unico = roles[0];

      if (unico) {
        papelSessao = unico;

        sessionStorage.setItem(
          "papel_sessao",
          unico
        );
      }
    }

    /*
     * Mais de um papel:
     * NÃO escolhemos automaticamente.
     *
     * O utilizador precisa escolher
     * explicitamente o papel da sessão.
     */
    else {
      const armazenado =
        sessionStorage.getItem(
          "papel_sessao"
        );

      if (
        papelValido(armazenado) &&
        roles.includes(armazenado)
      ) {
        papelSessao = armazenado;
      }
    }

    /*
     * Ainda não escolheu o papel.
     */
    if (!papelSessao) {
      sessionStorage.setItem(
        "papeis_disponiveis",
        JSON.stringify(roles)
      );

      throw redirect({
        to: "/selecionar-papel",
      });
    }

    const pathname =
      location.pathname;

    /*
     * Verifica se o papel seleccionado
     * pode entrar nesta rota.
     *
     * Admin tem acesso global.
     */
    if (
      rotaPermitidaParaPapel(
        papelSessao,
        pathname
      )
    ) {
      return {
        user: data.user,
        roles,
        papel: papelSessao,
      };
    }

    /*
     * Se tentou entrar numa área
     * que não pertence ao papel activo,
     * volta para o painel desse papel.
     */
    redirecionarParaPapel(
      papelSessao
    );
  },

  component: Layout,
});

function AuthenticatedPending() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
        <p className="mt-4 text-sm font-medium text-foreground">A carregar a área...</p>
        <p className="mt-1 text-xs text-muted-foreground">A verificar a sessão e preparar o painel.</p>
      </div>
    </div>
  );
}

function Layout() {
  const {
    data,
    isLoading,
  } = useSessao();

  const navigate =
    useNavigate();

  const queryClient =
    useQueryClient();

  const [menuMobileAberto, setMenuMobileAberto] = useState(false);

  let papelAtual: Papel | null = null;

  /*
   * Determina o papel activo nesta sessão.
   */
  if (
    data?.papeis?.length === 1
  ) {
    papelAtual =
      data.papeis[0] ?? null;
  }

  else if (
    data?.papeis &&
    data.papeis.length > 1
  ) {
    const armazenado =
      sessionStorage.getItem(
        "papel_sessao"
      );

    if (
      papelValido(armazenado) &&
      data.papeis.includes(
        armazenado
      )
    ) {
      papelAtual =
        armazenado;
    }
  }

  /*
   * Admin seleccionado:
   * mostra todas as áreas disponíveis.
   *
   * Outros papéis:
   * mostram apenas a sua área.
   */
  const links =
    papelAtual
      ? LINKS_POR_PAPEL[papelAtual]
      : [];

  function fecharMenuMobile() { setMenuMobileAberto(false); }

  function trocarPapel() {
    if (
      !data?.papeis ||
      data.papeis.length <= 1
    ) {
      return;
    }

    /*
     * Remove o papel actual para obrigar
     * a uma nova escolha explícita.
     */
    sessionStorage.removeItem(
      "papel_sessao"
    );

    sessionStorage.setItem(
      "papeis_disponiveis",
      JSON.stringify(data.papeis)
    );

    fecharMenuMobile();
    navigate({
      to: "/selecionar-papel",
      replace: true,
    });
  }

  async function sair() {
    sessionStorage.removeItem(
      "papel_sessao"
    );

    sessionStorage.removeItem(
      "papeis_disponiveis"
    );

    await queryClient.cancelQueries();

    queryClient.clear();

    await supabase.auth.signOut();

    fecharMenuMobile();
    navigate({
      to: "/auth",
      replace: true,
    });
  }

  const suspenso =
    !isLoading &&
    data &&
    data.activo === false;

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
                <Navigation className="h-4 w-4" />
              </span>
              <span className="truncate">PickApp Mobility</span>
            </Link>

            <nav className="hidden min-w-0 flex-1 flex-wrap items-center gap-1 text-sm md:flex">
              {links.map((l) => (
                <NavLink key={l.to} to={l.to}>
                  {l.label}
                </NavLink>
              ))}
            </nav>

            {papelAtual && (
              <span className="hidden max-w-36 truncate rounded-md bg-sidebar-accent px-2.5 py-1.5 text-xs font-medium sm:inline-flex sm:max-w-none">
                {papelAtual === "admin" && "Administrador"}
                {papelAtual === "operador" && "Operador"}
                {papelAtual === "motorista" && "Motorista"}
                {papelAtual === "passageiro" && "Passageiro"}
                {papelAtual === "responsavel_grupo" && "Resp. Grupo"}
              </span>
            )}

            {data?.papeis && data.papeis.length > 1 && (
              <Button
                size="sm"
                variant="outline"
                className="hidden shrink-0 border-white/30 bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent/80 hover:text-sidebar-foreground sm:inline-flex"
                onClick={trocarPapel}
              >
                Trocar conta
              </Button>
            )}

            {data?.user?.id && (
              <SinoNotificacoes userId={data.user.id} />
            )}

            <Button
              size="sm"
              variant="secondary"
              className="hidden sm:inline-flex"
              onClick={sair}
            >
              Sair
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="min-h-11 min-w-11 shrink-0 text-sidebar-foreground hover:bg-sidebar-accent md:hidden"
              onClick={() => setMenuMobileAberto((v) => !v)}
              aria-label={menuMobileAberto ? "Fechar menu" : "Abrir menu"}
              aria-expanded={menuMobileAberto}
            >
              {menuMobileAberto ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>

          <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-0.5 sm:hidden">
            {papelAtual && (
              <span className="shrink-0 rounded-md bg-sidebar-accent px-2.5 py-1.5 text-xs font-medium">
                {papelAtual === "admin" && "Administrador"}
                {papelAtual === "operador" && "Operador"}
                {papelAtual === "motorista" && "Motorista"}
                {papelAtual === "passageiro" && "Passageiro"}
                {papelAtual === "responsavel_grupo" && "Resp. Grupo"}
              </span>
            )}

            {data?.papeis && data.papeis.length > 1 && (
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
              onClick={sair}
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
          className="pointer-events-none absolute inset-0 -z-0 overflow-hidden opacity-[0.055]"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1800&q=75')",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />


        <div className="relative z-10">\n        {suspenso ? (
          <div className="mx-auto max-w-md rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-center">

            <h1 className="text-lg font-semibold text-destructive">
              Conta suspensa
            </h1>

            <p className="mt-2 text-sm text-muted-foreground">
              O acesso a esta conta foi suspenso por um administrador.
              Contacta o suporte se achares que isto é um engano.
            </p>

          </div>
        ) : (
          <Outlet />
        )}

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
      className="rounded-md px-3 py-2 transition-colors hover:bg-sidebar-accent md:py-1.5"
      activeProps={{
        className:
          "bg-sidebar-accent rounded-md px-3 py-1.5",
      }}
    >
      {children}
    </Link>
  );
}

// Visual accessibility polish synced from GitHub.
