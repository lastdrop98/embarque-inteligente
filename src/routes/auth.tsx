import { createFileRoute, useNavigate, useRouter, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Rotas & Embarque QR" },
      { name: "description", content: "Acesso de operadores e motoristas ao centro de mobilidade." },
      { property: "og:title", content: "Entrar — Rotas & Embarque QR" },
      { property: "og:description", content: "Acesso de operadores e motoristas ao centro de mobilidade." },
    ],
  }),
  component: AuthPage,
});

function traduzErro(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "Email ou palavra-passe incorrectos.";
  if (m.includes("email not confirmed")) return "Email ainda não confirmado. Verifica a tua caixa de entrada (ou pede a um operador para desactivar a confirmação de email nas definições do Supabase).";
  if (m.includes("user already registered")) return "Já existe uma conta com este email. Tenta entrar em vez de criar conta.";
  if (m.includes("password should be at least")) return "A palavra-passe deve ter pelo menos 6 caracteres.";
  if (m.includes("unable to validate email")) return "Endereço de email inválido.";
  if (m.includes("database error")) return "Erro na base de dados ao criar a conta. Contacta o suporte técnico.";
  if (m.includes("failed to fetch") || m.includes("networkerror")) return "Falha de ligação ao servidor. Verifica a tua internet e tenta novamente.";
  return msg;
}

function AuthPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState("");
  const [papel, setPapel] = useState<"operador" | "motorista">("operador");
  const [loading, setLoading] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        console.error("[auth] signIn error:", error);
        toast.error(traduzErro(error.message));
        return;
      }
      if (!data.session) {
        toast.error("Não foi possível iniciar sessão. Tenta novamente.");
        return;
      }
      await router.invalidate();
      navigate({ to: "/painel", replace: true });
    } catch (err) {
      console.error("[auth] signIn exception:", err);
      toast.error("Ocorreu um erro inesperado ao entrar. Tenta novamente.");
    } finally {
      setLoading(false);
    }
  }

  async function registar(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: window.location.origin + "/auth",
          data: { nome, papel },
        },
      });
      if (error) {
        console.error("[auth] signUp error:", error);
        toast.error(traduzErro(error.message));
        return;
      }
      if (!data.session) {
        // Sem sessão logo após o registo normalmente significa que a confirmação
        // de email está activa no Supabase. Tentamos entrar de imediato — se a
        // conta não precisar mesmo de confirmação, isto resolve sozinho.
        const tentativa = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (tentativa.data.session) {
          await router.invalidate();
          navigate({ to: "/painel", replace: true });
          return;
        }
        toast.success(
          "Conta criada. Se não conseguires entrar agora, é preciso confirmar o email ou desactivar essa exigência nas definições do Supabase."
        );
        return;
      }
      await router.invalidate();
      navigate({ to: "/painel", replace: true });
    } catch (err) {
      console.error("[auth] signUp exception:", err);
      toast.error("Ocorreu um erro inesperado ao criar a conta. Tenta novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary px-4 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 block text-center text-sm text-muted-foreground hover:text-foreground">
          ← Rotas &amp; Embarque QR
        </Link>
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Acesso à plataforma</CardTitle>
            <CardDescription>Operadores e motoristas.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="entrar">
              <TabsList className="mb-4 grid w-full grid-cols-2">
                <TabsTrigger value="entrar">Entrar</TabsTrigger>
                <TabsTrigger value="registar">Criar conta</TabsTrigger>
              </TabsList>

              <TabsContent value="entrar">
                <form onSubmit={entrar} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pw">Palavra-passe</Label>
                    <Input id="pw" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "A entrar..." : "Entrar"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="registar">
                <form onSubmit={registar} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="nome">Nome</Label>
                    <Input id="nome" required value={nome} onChange={(e) => setNome(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email2">Email</Label>
                    <Input id="email2" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pw2">Palavra-passe</Label>
                    <Input id="pw2" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Papel</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["operador", "motorista"] as const).map((p) => (
                        <Button
                          key={p}
                          type="button"
                          variant={papel === p ? "default" : "outline"}
                          onClick={() => setPapel(p)}
                        >
                          {p === "operador" ? "Operador" : "Motorista"}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "A criar..." : "Criar conta"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
