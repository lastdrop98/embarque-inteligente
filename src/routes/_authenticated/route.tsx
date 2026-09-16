import { createFileRoute, Outlet, redirect, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useSessao } from "@/lib/useSessao";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: Layout,
});

function Layout() {
  const { data } = useSessao();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function sair() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-secondary">
      <header className="bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
          <Link to="/" className="font-semibold tracking-tight">
            Rotas &amp; Embarque QR
          </Link>
          <nav className="flex flex-1 flex-wrap gap-1 text-sm">
            <NavLink to="/painel">Painel</NavLink>
            {data?.papel === "operador" && <NavLink to="/operador">Operador</NavLink>}
            <NavLink to="/motorista">Motorista</NavLink>
          </nav>
          <span className="text-xs opacity-70">{data?.papel}</span>
          <Button size="sm" variant="secondary" onClick={sair}>
            Sair
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}

function NavLink({ to, children }: { to: "/painel" | "/operador" | "/motorista"; children: React.ReactNode }) {
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
