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


export const Route = createFileRoute("/_authenticated")({

  ssr: false,

  beforeLoad: async ({ location }) => {

    const {
      data,
      error,
    } = await supabase.auth.getUser();

    /*
     * Sem utilizador autenticado:
     * voltar para o login.
     */

    if (error || !data.user) {
      throw redirect({
        to: "/auth",
      });
    }

    /*
     * Obter os papéis do utilizador.
     */

    const {
      data: papeis,
      error: papelError,
    } = await supabase
      .from("papeis_utilizador")
      .select("role")
      .eq("user_id", data.user.id);

    if (papelError) {

      console.error(
        "[route] erro ao obter papel:",
        papelError
      );

      throw redirect({
        to: "/auth",
      });
    }

    const roles = new Set(
      (papeis ?? []).map(
        (p) => p.role as string
      )
    );

    const path = location.pathname;

    /*
     * Administrador:
     * pode entrar em todas as áreas autenticadas.
     */

    if (roles.has("admin")) {
      return {
        user: data.user,
        roles: [...roles],
      };
    }

    /*
     * Operador.
     */

    if (
      roles.has("operador") &&
      [
        "/painel",
        "/operador",
        "/pedidos",
      ].includes(path)
    ) {
      return {
        user: data.user,
        roles: [...roles],
      };
    }

    /*
     * Motorista.
     */

    if (
      roles.has("motorista") &&
      [
        "/painel",
        "/motorista",
      ].includes(path)
    ) {
      return {
        user: data.user,
        roles: [...roles],
      };
    }

    /*
     * Passageiro.
     */

    if (
      roles.has("passageiro") &&
      path === "/passageiro"
    ) {
      return {
        user: data.user,
        roles: [...roles],
      };
    }

    /*
     * Se chegou aqui, o utilizador está autenticado
     * mas tentou entrar numa área que não corresponde
     * ao seu papel.
     */

    if (roles.has("admin")) {
      throw redirect({
        to: "/admin",
      });
    }

    if (roles.has("operador")) {
      throw redirect({
        to: "/operador",
      });
    }

    if (roles.has("motorista")) {
      throw redirect({
        to: "/motorista",
      });
    }

    if (roles.has("passageiro")) {
      throw redirect({
        to: "/passageiro",
      });
    }

    throw redirect({
      to: "/auth",
    });
  },

  component: Layout,
});


/*
 * Rotas utilizadas pela navegação.
 */

type Rota =
  | "/painel"
  | "/operador"
  | "/motorista"
  | "/admin"
  | "/passageiro"
  | "/pedidos";


/*
 * Links disponíveis por papel.
 */

const LINKS_POR_PAPEL: Record<
  Papel,
  { to: Rota; label: string }[]
> = {

  admin: [
    {
      to: "/admin",
      label: "Admin",
    },
    {
      to: "/painel",
      label: "Painel",
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
      to: "/pedidos",
      label: "Pedidos",
    },
  ],

  operador: [
    {
      to: "/painel",
      label: "Painel",
    },
    {
      to: "/operador",
      label: "Operador",
    },
    {
      to: "/pedidos",
      label: "Pedidos",
    },
  ],

  motorista: [
    {
      to: "/painel",
      label: "Painel",
    },
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


function Layout() {

  const {
    data,
    isLoading,
  } = useSessao();

  const navigate = useNavigate();

  const queryClient =
    useQueryClient();


  async function sair() {

    await queryClient.cancelQueries();

    queryClient.clear();

    await supabase.auth.signOut();

    navigate({
      to: "/auth",
      replace: true,
    });
  }


  const links =
    data?.papel
      ? LINKS_POR_PAPEL[data.papel]
      : [];


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


          <span className="text-xs opacity-70">
            {data?.papel}
          </span>


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
