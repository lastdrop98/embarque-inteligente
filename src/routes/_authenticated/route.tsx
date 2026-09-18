```tsx
import {
  createFileRoute,
  Outlet,
  redirect,
  Link,
  useNavigate,
} from "@tanstack/react-router";

import { useQueryClient } from "@tanstack/react-query";

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
  | "/passageiro";

const PAPEIS_VALIDOS: Papel[] = [
  "admin",
  "operador",
  "motorista",
  "passageiro",
];

const ROTA_POR_PAPEL: Record<Papel, Rota> = {
  admin: "/admin",
  operador: "/operador",
  motorista: "/motorista",
  passageiro: "/passageiro",
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
  switch (papel) {
    case "admin":
      return (
        pathname === "/admin" ||
        pathname.startsWith("/admin/")
      );

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

    default:
      return false;
  }
}

function redirecionarParaPapel(
  papel: Papel
) {
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
  }
}

export const Route = createFileRoute(
  "/_authenticated"
)({
  ssr: false,

  beforeLoad: async ({
    location,
  }) => {
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
     * Uma conta sem papel não pode entrar.
     */
    if (roles.length === 0) {
      console.error(
        "[route] utilizador sem papel:",
        data.user.id
      );

      throw redirect({
        to: "/auth",
      });
    }

    let papelSessao: Papel | null = null;

    /*
     * Se existe apenas um papel,
     * esse é o papel da sessão.
     */
    if (roles.length === 1) {
      papelSessao = roles[0];
    } else {
      /*
       * Se existem vários papéis,
       * só usamos aquele que o utilizador
       * escolheu explicitamente.
       */
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
     * Conta com vários papéis sem
     * escolha explícita.
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
     * Impede acesso a painéis pertencentes
     * a outro papel.
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
     * Se tentar abrir manualmente outro painel,
     * volta para o painel do papel escolhido.
     */
    redirecionarParaPapel(
      papelSessao
    );
  },

  component: Layout,
});

function Layout() {
  const {
    data,
    isLoading,
  } = useSessao();

  const navigate =
    useNavigate();

  const queryClient =
    useQueryClient();

  let papelAtual: Papel | null = null;

  /*
   * Conta com apenas um papel.
   */
  if (
    data?.papeis?.length === 1
  ) {
    papelAtual =
      data.papeis[0];
  }

  /*
   * Conta com vários papéis:
   * usa somente o papel escolhido
   * para esta sessão.
   */
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

  const links =
    papelAtual
      ? LINKS_POR_PAPEL[papelAtual]
      : [];

  /*
   * Permite trocar de papel sem
   * terminar a sessão.
   */
  function trocarPapel() {
    if (
      !data?.papeis ||
      data.papeis.length <= 1
    ) {
      return;
    }

    sessionStorage.removeItem(
      "papel_sessao"
    );

    sessionStorage.setItem(
      "papeis_disponiveis",
      JSON.stringify(data.papeis)
    );

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
      <header className="bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">

          <Link
            to="/"
            className="font-semibold tracking-tight"
          >
            Rotas &amp; Embarque QR
          </Link>

          <nav className="flex flex-1 flex-wrap gap-1 text-sm">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
              >
                {l.label}
              </NavLink>
            ))}
          </nav>

          {papelAtual && (
            <span className="rounded-md bg-sidebar-accent px-3 py-1.5 text-xs font-medium">
              {papelAtual === "admin" &&
                "Administrador"}

              {papelAtual === "operador" &&
                "Operador"}

              {papelAtual === "motorista" &&
                "Motorista"}

              {papelAtual === "passageiro" &&
                "Passageiro"}
            </span>
          )}

          {data?.papeis &&
            data.papeis.length > 1 && (
              <Button
                size="sm"
                variant="outline"
                onClick={trocarPapel}
              >
                Trocar papel
              </Button>
            )}

          {data?.user?.id && (
            <SinoNotificacoes
              userId={data.user.id}
            />
          )}

          <Button
            size="sm"
            variant="secondary"
            onClick={sair}
          >
            Sair
          </Button>

        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {suspenso ? (
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
}: {
  to: Rota;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="rounded-md px-3 py-1.5 transition-colors hover:bg-sidebar-accent"
      activeProps={{
        className:
          "bg-sidebar-accent rounded-md px-3 py-1.5",
      }}
    >
      {children}
    </Link>
  );
}
```
