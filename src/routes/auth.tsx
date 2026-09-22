import {
  createFileRoute,
  useNavigate,
  useRouter,
  Link,
} from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, CheckCircle2, MapPin, Route as RouteIcon, ShieldCheck, Sparkles } from "lucide-react";

type Papel =
  | "admin"
  | "operador"
  | "motorista"
  | "passageiro"
  | "responsavel_grupo";

const PAPEIS_VALIDOS: Papel[] = [
  "admin",
  "operador",
  "motorista",
  "passageiro",
  "responsavel_grupo",
];

const ROTAS_POR_PAPEL: Record<Papel, string> = {
  admin: "/admin",
  operador: "/operador",
  motorista: "/motorista",
  passageiro: "/passageiro",
  responsavel_grupo: "/grupo",
};

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — PickApp Mobility" },
      {
        name: "description",
        content:
          "Acesso de operadores, motoristas e passageiros ao centro de mobilidade.",
      },
      { property: "og:title", content: "Entrar — PickApp Mobility" },
      {
        property: "og:description",
        content:
          "Acesso de operadores, motoristas e passageiros ao centro de mobilidade.",
      },
    ],
  }),
  component: AuthPage,
});

function traduzErro(msg: string): string {
  const m = msg.toLowerCase();

  if (m.includes("invalid login credentials")) return "Email ou palavra-passe incorrectos.";
  if (m.includes("email not confirmed")) return "O email ainda não foi confirmado. Verifica a tua caixa de entrada.";
  if (m.includes("user already registered")) return "Já existe uma conta com este email. Tenta entrar em vez de criar uma nova conta.";
  if (m.includes("password should be at least")) return "A palavra-passe deve ter pelo menos 6 caracteres.";
  if (m.includes("unable to validate email")) return "Endereço de email inválido.";
  if (m.includes("database error saving new user") || m.includes("database error")) {
    return "O servidor não conseguiu concluir a criação da conta. Verifica a configuração do Supabase e do trigger de novos utilizadores.";
  }
  if (m.includes("failed to fetch") || m.includes("networkerror") || m.includes("network request failed")) {
    return "Falha de ligação ao servidor. Verifica a tua internet e tenta novamente.";
  }
  return msg;
}

function AuthPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState("");
  const [papel, setPapel] = useState<"motorista" | "passageiro">("passageiro");
  const [loading, setLoading] = useState(false);

  async function seguirParaPainel() {
    await router.invalidate();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) {
      console.error("[auth] erro ao obter utilizador:", userError);
      toast.error("Não foi possível verificar a tua sessão. Tenta novamente.");
      return;
    }

    const uid = user?.id;
    if (!uid) {
      navigate({ to: "/auth", replace: true });
      return;
    }

    const { data: papeis, error } = await supabase
      .from("papeis_utilizador")
      .select("role")
      .eq("user_id", uid);

    if (error) {
      console.error("[auth] erro ao obter papéis:", error);
      toast.error("Não foi possível verificar os papéis da tua conta.");
      return;
    }

    const lista: Papel[] = [
      ...new Set(
        (papeis ?? [])
          .map((p) => p.role as string)
          .filter((role): role is Papel => PAPEIS_VALIDOS.includes(role as Papel))
      ),
    ];

    if (lista.length === 0) {
      toast.error("A tua conta não possui nenhum papel atribuído. Contacta o administrador.");
      return;
    }

    if (lista.length === 1) {
      const unico = lista[0];
      if (!unico) return;
      navigate({ to: ROTAS_POR_PAPEL[unico], replace: true });
      return;
    }

    sessionStorage.setItem("papeis_disponiveis", JSON.stringify(lista));
    navigate({ to: "/selecionar-papel", replace: true });
  }

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

      await seguirParaPainel();
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

    const emailLimpo = email.trim();
    const nomeLimpo = nome.trim();

    if (!nomeLimpo) {
      toast.error("Introduz o teu nome.");
      return;
    }
    if (!emailLimpo) {
      toast.error("Introduz um email válido.");
      return;
    }
    if (password.length < 6) {
      toast.error("A palavra-passe deve ter pelo menos 6 caracteres.");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: emailLimpo,
        password,
        options: {
          emailRedirectTo: window.location.origin + "/auth",
          data: { nome: nomeLimpo, papel },
        },
      });

      if (error) {
        console.error("[auth] signUp error:", error);
        toast.error(traduzErro(error.message));
        return;
      }

      if (data.session) {
        toast.success("Conta criada com sucesso.");
        await seguirParaPainel();
        return;
      }

      const tentativa = await supabase.auth.signInWithPassword({
        email: emailLimpo,
        password,
      });

      if (tentativa.error) {
        console.warn("[auth] tentativa de login após registo:", tentativa.error);
      }

      if (tentativa.data.session) {
        toast.success("Conta criada com sucesso.");
        await seguirParaPainel();
        return;
      }

      toast.success("Conta criada. Verifica o teu email para concluir o acesso.");
    } catch (err) {
      console.error("[auth] signUp exception:", err);
      toast.error("Ocorreu um erro inesperado ao criar a conta. Tenta novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="grid min-h-screen lg:grid-cols-[1.08fr_0.92fr]">
        <section
          className="relative hidden overflow-hidden lg:flex"
          style={{
            backgroundImage:
              "linear-gradient(135deg, rgba(5,18,42,.88), rgba(7,64,83,.58)), url('https://images.unsplash.com/photo-1519003722824-194d4455a60c?auto=format&fit=crop&w=1800&q=85')",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(0,200,83,.38),transparent_30%),radial-gradient(circle_at_85%_75%,rgba(56,189,248,.28),transparent_34%)]" />
          <div className="absolute -left-20 top-20 h-64 w-64 animate-[premium-pulse_5s_ease-in-out_infinite] rounded-full bg-emerald-300/15 blur-3xl" />
          <div className="absolute -right-24 bottom-16 h-80 w-80 animate-[premium-pulse_6s_ease-in-out_infinite] rounded-full bg-cyan-300/15 blur-3xl" />

          <div className="relative z-10 flex w-full flex-col justify-between p-10 xl:p-14">
            <Link to="/" className="inline-flex w-fit items-center gap-3 text-white">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
                <MapPin className="h-5 w-5 text-white" />
              </span>
              <span className="text-lg font-semibold tracking-tight">PickApp Mobility</span>
            </Link>

            <div className="max-w-xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white backdrop-blur">
                <Sparkles className="h-3.5 w-3.5 text-emerald-300" />
                Embarque Inteligente
              </div>
              <h1 className="text-5xl font-bold leading-[1.04] tracking-[-0.04em] text-white xl:text-6xl">
                A mobilidade da sua equipa, num só lugar.
              </h1>
              <p className="mt-6 max-w-lg text-base leading-7 text-white/80">
                Rotas, passageiros, motoristas e validação por QR Code com uma experiência operacional simples.
              </p>

              <div className="mt-8 grid max-w-lg gap-3 sm:grid-cols-3">
                {[
                  { icon: RouteIcon, label: "Rotas" },
                  { icon: ShieldCheck, label: "Segurança" },
                  { icon: CheckCircle2, label: "Embarque QR" },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl border border-white/15 bg-slate-950/25 p-4 text-white backdrop-blur-md">
                    <item.icon className="h-5 w-5 text-emerald-300" />
                    <p className="mt-3 text-sm font-semibold text-white">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-xs text-white/60">PickApp Mobility · Embarque Inteligente</p>
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-8 lg:px-12">
          <div className="w-full max-w-md">
            <Link
              to="/"
              className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-slate-950"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar ao início
            </Link>

            <Card className="border-white/70 bg-white/95 shadow-[0_30px_80px_-35px_rgba(15,23,42,.35)] backdrop-blur-xl">
              <CardHeader className="pb-4">
                <CardTitle className="text-2xl font-bold tracking-tight text-slate-900">
                  Acesso à plataforma
                </CardTitle>
                <CardDescription className="text-slate-500">
                  Entre na sua área de trabalho PickApp Mobility.
                </CardDescription>
              </CardHeader>

              <CardContent>
                <Tabs defaultValue="entrar">
                  <TabsList className="mb-5 grid w-full grid-cols-2 bg-slate-100">
                    <TabsTrigger value="entrar">Entrar</TabsTrigger>
                    <TabsTrigger value="registar">Criar conta</TabsTrigger>
                  </TabsList>

                  <TabsContent value="entrar">
                    <form onSubmit={entrar} className="space-y-5">
                      <div className="space-y-2">
                        <Label htmlFor="email" className="text-slate-700">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          required
                          autoComplete="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="h-11 border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus-visible:ring-slate-400"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="pw" className="text-slate-700">Palavra-passe</Label>
                        <Input
                          id="pw"
                          type="password"
                          required
                          autoComplete="current-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="h-11 border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus-visible:ring-slate-400"
                        />
                      </div>

                      <Button
                        type="submit"
                        className="h-11 w-full bg-slate-950 font-semibold text-white hover:bg-slate-800"
                        disabled={loading}
                      >
                        {loading ? "A entrar..." : "Entrar"}
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </form>
                  </TabsContent>

                  <TabsContent value="registar">
                    <form onSubmit={registar} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="nome" className="text-slate-700">Nome</Label>
                        <Input
                          id="nome"
                          required
                          value={nome}
                          onChange={(e) => setNome(e.target.value)}
                          className="h-11 border-slate-200 bg-white text-slate-900"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="email2" className="text-slate-700">Email</Label>
                        <Input
                          id="email2"
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="h-11 border-slate-200 bg-white text-slate-900"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="pw2" className="text-slate-700">Palavra-passe</Label>
                        <Input
                          id="pw2"
                          type="password"
                          required
                          minLength={6}
                          autoComplete="new-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="h-11 border-slate-200 bg-white text-slate-900"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-slate-700">Tipo de conta</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            type="button"
                            variant={papel === "motorista" ? "default" : "outline"}
                            className={papel === "motorista" ? "text-white" : "text-slate-700"}
                            onClick={() => setPapel("motorista")}
                          >
                            Motorista
                          </Button>
                          <Button
                            type="button"
                            variant={papel === "passageiro" ? "default" : "outline"}
                            className={papel === "passageiro" ? "text-white" : "text-slate-700"}
                            onClick={() => setPapel("passageiro")}
                          >
                            Passageiro
                          </Button>
                        </div>
                      </div>

                      <Button
                        type="submit"
                        className="h-11 w-full bg-slate-950 font-semibold text-white hover:bg-slate-800"
                        disabled={loading}
                      >
                        {loading ? "A criar..." : "Criar conta"}
                      </Button>
                    </form>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </main>
  );
}
