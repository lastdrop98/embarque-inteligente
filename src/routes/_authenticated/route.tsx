import { createFileRoute, Outlet, redirect, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useSessao, type Papel } from "@/lib/useSessao";
import { SinoNotificacoes } from "@/components/SinoNotificacoes";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: Layout,
});

type Rota = "/painel" | "/operador" | "/motorista" | "/admin" | "/passageiro";

const LINKS_POR_PAPEL: Record<Papel, { to: Rota; label: string }[]> = {
  admin: [
    { to: "/admin", label: "Admin" },
    { to: "/painel", label: "Painel" },
    { to: "/operador", label: "Operador" },
    { to: "/motorista", label: "Motorista" },
  ],
  operador: [
    { to: "/painel", label: "Painel" },
    { to: "/operador", label: "Operador" },
  ],
  motorista: [
    { to: "/painel", label: "Painel" },
    { to: "/motorista", label: "Motorista" },
  ],
  passageiro: [{ to: "/passageiro", label: "Os meus bilhetes" }],
};

function Layout() {
  const { data, isLoading } = useSessao();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function sair() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const links = data?.papel ? LINKS_POR_PAPEL[data.papel] : [];
  const suspenso = !isLoading && data && data.activo === false;

  return (
    <div className="min-h-screen bg-secondary">
      <header className="bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
          <Link to="/" className="font-semibold tracking-tight">
            Rotas &amp; Embarque QR
          </Link>
          <nav className="flex flex-1 flex-wrap gap-1 text-sm">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to}>
                {l.label}
              </NavLink>
            ))}
          </nav>
          <span className="text-xs opacity-70">{data?.papel}</span>
          {data?.user?.id && <SinoNotificacoes userId={data.user.id} />}
          <Button size="sm" variant="secondary" onClick={sair}>
            Sair
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        {suspenso ? (
          <div className="mx-auto max-w-md rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-center">
            <h1 className="text-lg font-semibold text-destructive">Conta suspensa</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              O acesso a esta conta foi suspenso por um administrador. Contacta o suporte se achares que isto é um
              engano.
            </p>
          </div>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
}

function NavLink({ to, children }: { to: Rota; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="rounded-md px-3 py-1.5 transition-colors hover:bg-sidebar-accent"
      activeProps={{ className: "bg-sidebar-accent rounded-md px-3 py-1.5" }}
    >
      {children}
    </Link>
  );
}
