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

type Papel =
  | "admin"
  | "operador"
  | "motorista"
  | "passageiro";

const PAPEIS_VALIDOS: Papel[] = [
  "admin",
  "operador",
  "motorista",
  "passageiro",
];

const ROTAS_POR_PAPEL: Record<Papel, string> = {
  admin: "/admin",
  operador: "/operador",
  motorista: "/motorista",
  passageiro: "/passageiro",
};

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Rotas & Embarque QR" },
      {
        name: "description",
        content:
          "Acesso de operadores, motoristas e passageiros ao centro de mobilidade.",
      },
      {
        property: "og:title",
        content: "Entrar — Rotas & Embarque QR",
      },
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

  if (m.includes("invalid login credentials")) {
    return "Email ou palavra-passe incorrectos.";
  }

  if (m.includes("email not confirmed")) {
    return "O email ainda não foi confirmado. Verifica a tua caixa de entrada.";
  }

  if (m.includes("user already registered")) {
    return "Já existe uma conta com este email. Tenta entrar em vez de criar uma nova conta.";
  }

  if (m.includes("password should be at least")) {
    return "A palavra-passe deve ter pelo menos 6 caracteres.";
  }

  if (m.includes("unable to validate email")) {
    return "Endereço de email inválido.";
  }

  if (
    m.includes("database error saving new user") ||
    m.includes("database error")
  ) {
    return "O servidor não conseguiu concluir a criação da conta. Verifica a configuração do Supabase e do trigger de novos utilizadores.";
  }

  if (
    m.includes("failed to fetch") ||
    m.includes("networkerror") ||
    m.includes("network request failed")
  ) {
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

  // Registo público:
  // apenas motorista ou passageiro.
  // operador/admin devem ser atribuídos posteriormente
  // por um utilizador autorizado.
  const [papel, setPapel] = useState<
    "motorista" | "passageiro"
  >("passageiro");

  const [loading, setLoading] = useState(false);

  async function seguirParaPainel() {
    await router.invalidate();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      console.error(
        "[auth] erro ao obter utilizador:",
        userError
      );

      toast.error(
        "Não foi possível verificar a tua sessão. Tenta novamente."
      );

      return;
    }

    const uid = user?.id;

    if (!uid) {
      navigate({
        to: "/auth",
        replace: true,
      });

      return;
    }

    const { data: papeis, error } = await supabase
      .from("papeis_utilizador")
      .select("role")
      .eq("user_id", uid);

    if (error) {
      console.error(
        "[auth] erro ao obter papéis:",
        error
      );

      toast.error(
        "Não foi possível verificar os papéis da tua conta."
      );

      return;
    }

    const lista: Papel[] = [
      ...new Set(
        (papeis ?? [])
          .map((p) => p.role as string)
          .filter((role): role is Papel =>
            PAPEIS_VALIDOS.includes(
              role as Papel
            )
          )
      ),
    ];

    /*
     * Nenhum papel atribuído.
     * Não devemos escolher automaticamente
     * motorista, passageiro ou qualquer outro papel.
     */
    if (lista.length === 0) {
      toast.error(
        "A tua conta não possui nenhum papel atribuído. Contacta o administrador."
      );

      return;
    }

    /*
     * Apenas um papel:
     * podemos entrar directamente no painel correspondente.
     */
    if (lista.length === 1) {
      const unico = lista[0];

      if (!unico) return;

      const rota = ROTAS_POR_PAPEL[unico];

      navigate({
        to: rota,
        replace: true,
      });

      return;
    }

    /*
     * Mais de um papel:
     * o utilizador deve escolher explicitamente
     * com que papel pretende entrar nesta sessão.
     */
    sessionStorage.setItem(
      "papeis_disponiveis",
      JSON.stringify(lista)
    );

    navigate({
      to: "/selecionar-papel",
      replace: true,
    });
  }

  async function entrar(e: React.FormEvent) {
    e.preventDefault();

    if (loading) return;

    setLoading(true);

    try {
      const { data, error } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (error) {
        console.error(
          "[auth] signIn error:",
          error
        );

        toast.error(
          traduzErro(error.message)
        );

        return;
      }

      if (!data.session) {
        toast.error(
          "Não foi possível iniciar sessão. Tenta novamente."
        );

        return;
      }

      await seguirParaPainel();
    } catch (err) {
      console.error(
        "[auth] signIn exception:",
        err
      );

      toast.error(
        "Ocorreu um erro inesperado ao entrar. Tenta novamente."
      );
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
      toast.error(
        "A palavra-passe deve ter pelo menos 6 caracteres."
      );
      return;
    }

    setLoading(true);

    try {
      const { data, error } =
        await supabase.auth.signUp({
          email: emailLimpo,
          password,
          options: {
            emailRedirectTo:
              window.location.origin + "/auth",

            data: {
              nome: nomeLimpo,
              papel,
            },
          },
        });

      if (error) {
        console.error(
          "[auth] signUp error:",
          error
        );

        toast.error(
          traduzErro(error.message)
        );

        return;
      }

      /*
       * Dependendo da configuração do Supabase,
       * a sessão pode ou não ser criada imediatamente.
       */
      if (data.session) {
        toast.success(
          "Conta criada com sucesso."
        );

        await seguirParaPainel();
        return;
      }

      /*
       * Se não houver sessão, tentamos iniciar sessão.
       * Isto funciona quando a confirmação de email
       * não é obrigatória.
       */
      const tentativa =
        await supabase.auth.signInWithPassword({
          email: emailLimpo,
          password,
        });

      if (tentativa.error) {
        console.warn(
          "[auth] tentativa de login após registo:",
          tentativa.error
        );
      }

      if (tentativa.data.session) {
        toast.success(
          "Conta criada com sucesso."
        );

        await seguirParaPainel();
        return;
      }

      /*
       * A conta provavelmente foi criada,
       * mas o Supabase exige confirmação do email.
       */
      toast.success(
        "Conta criada. Verifica o teu email para concluir o acesso."
      );
    } catch (err) {
      console.error(
        "[auth] signUp exception:",
        err
      );

      toast.error(
        "Ocorreu um erro inesperado ao criar a conta. Tenta novamente."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary px-4 py-12">
      <div className="w-full max-w-md">

        <Link
          to="/"
          className="mb-6 block text-center text-sm text-muted-foreground hover:text-foreground"
        >
          ← Rotas &amp; Embarque QR
        </Link>

        <Card className="shadow-lg">

          <CardHeader>
            <CardTitle>
              Acesso à plataforma
            </CardTitle>

            <CardDescription>
              Operadores, motoristas e passageiros.
            </CardDescription>
          </CardHeader>

          <CardContent>

            <Tabs defaultValue="entrar">

              <TabsList className="mb-4 grid w-full grid-cols-2">
                <TabsTrigger value="entrar">
                  Entrar
                </TabsTrigger>

                <TabsTrigger value="registar">
                  Criar conta
                </TabsTrigger>
              </TabsList>

              {/* LOGIN */}

              <TabsContent value="entrar">

                <form
                  onSubmit={entrar}
                  className="space-y-4"
                >

                  <div className="space-y-2">
                    <Label htmlFor="email">
                      Email
                    </Label>

                    <Input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) =>
                        setEmail(e.target.value)
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pw">
                      Palavra-passe
                    </Label>

                    <Input
                      id="pw"
                      type="password"
                      required
                      value={password}
                      onChange={(e) =>
                        setPassword(e.target.value)
                      }
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={loading}
                  >
                    {loading
                      ? "A entrar..."
                      : "Entrar"}
                  </Button>

                </form>

              </TabsContent>

              {/* REGISTO */}

              <TabsContent value="registar">

                <form
                  onSubmit={registar}
                  className="space-y-4"
                >

                  <div className="space-y-2">

                    <Label htmlFor="nome">
                      Nome
                    </Label>

                    <Input
                      id="nome"
                      required
                      value={nome}
                      onChange={(e) =>
                        setNome(e.target.value)
                      }
                    />

                  </div>

                  <div className="space-y-2">

                    <Label htmlFor="email2">
                      Email
                    </Label>

                    <Input
                      id="email2"
                      type="email"
                      required
                      value={email}
                      onChange={(e) =>
                        setEmail(e.target.value)
                      }
                    />

                  </div>

                  <div className="space-y-2">

                    <Label htmlFor="pw2">
                      Palavra-passe
                    </Label>

                    <Input
                      id="pw2"
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) =>
                        setPassword(e.target.value)
                      }
                    />

                  </div>

                  <div className="space-y-2">

                    <Label>
                      Tipo de conta
                    </Label>

                    <div className="grid grid-cols-2 gap-2">

                      <Button
                        type="button"
                        variant={
                          papel === "motorista"
                            ? "default"
                            : "outline"
                        }
                        onClick={() =>
                          setPapel("motorista")
                        }
                      >
                        Motorista
                      </Button>

                      <Button
                        type="button"
                        variant={
                          papel === "passageiro"
                            ? "default"
                            : "outline"
                        }
                        onClick={() =>
                          setPapel("passageiro")
                        }
                      >
                        Passageiro
                      </Button>

                    </div>

                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={loading}
                  >
                    {loading
                      ? "A criar..."
                      : "Criar conta"}
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
