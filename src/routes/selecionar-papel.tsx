import {
  createFileRoute,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";

type Papel =
  | "admin"
  | "operador"
  | "motorista"
  | "passageiro" | "responsavel_grupo";

const PAPEIS_VALIDOS: Papel[] = [
  "admin",
  "operador",
  "motorista",
  "passageiro",
  "responsavel_grupo",
];

const INFORMACOES_PAPEL: Record<
  Papel,
  {
    titulo: string;
    descricao: string;
    icone: string;
    rota: string;
  }
> = {
  admin: {
    titulo: "Administrador",
    descricao:
      "Gestão global da plataforma, utilizadores, papéis, configurações e supervisão geral.",
    icone: "🛡️",
    rota: "/admin",
  },

  operador: {
    titulo: "Operador",
    descricao:
      "Gestão operacional de rotas, passageiros, veículos, viagens e operações de transporte.",
    icone: "⚙️",
    rota: "/operador",
  },

  motorista: {
    titulo: "Motorista",
    descricao:
      "Gestão das viagens atribuídas, passageiros, embarques, desembarques e ocorrências.",
    icone: "🚗",
    rota: "/motorista",
  },

  responsavel_grupo: {
    titulo: "Responsável de Grupo",
    descricao: "Gestão das solicitações e passageiros do seu grupo.",
    icone: "👥",
    rota: "/grupo",
  },

  passageiro: {
    titulo: "Passageiro",
    descricao:
      "Acesso às viagens, bilhetes, QR Code, histórico e acompanhamento das suas deslocações.",
    icone: "👤",
    rota: "/passageiro",
  },
};

export const Route = createFileRoute("/selecionar-papel")({
  component: SelecionarPapelPage,
});

function SelecionarPapelPage() {
  const navigate = useNavigate();

  const [papeis, setPapeis] = useState<Papel[]>([]);
  const [loading, setLoading] = useState(true);
  const [entrando, setEntrando] = useState<Papel | null>(null);

  useEffect(() => {
    async function carregarPapeis() {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          navigate({
            to: "/auth",
            replace: true,
          });

          return;
        }

        const { data, error } = await supabase
          .from("papeis_utilizador")
          .select("role")
          .eq("user_id", user.id);

        if (error) {
          console.error(
            "[selecionar-papel] erro ao obter papéis:",
            error
          );

          toast.error(
            "Não foi possível carregar os papéis da tua conta."
          );

          navigate({
            to: "/auth",
            replace: true,
          });

          return;
        }

        const lista: Papel[] = [
          ...new Set(
            (data ?? [])
              .map((item) => item.role as string)
              .filter((role): role is Papel =>
                PAPEIS_VALIDOS.includes(
                  role as Papel
                )
              )
          ),
        ];

        if (lista.length === 0) {
          toast.error(
            "A tua conta não possui nenhum papel atribuído."
          );

          navigate({
            to: "/auth",
            replace: true,
          });

          return;
        }

        /*
         * Se por algum motivo esta página for aberta
         * com apenas um papel, não mostramos uma
         * seleção desnecessária.
         */
        if (lista.length === 1) {
          const unico = lista[0];

          if (!unico) return;

          navigate({
            to: INFORMACOES_PAPEL[unico].rota,
            replace: true,
          });

          return;
        }

        setPapeis(lista);
      } catch (error) {
        console.error(
          "[selecionar-papel] erro inesperado:",
          error
        );

        toast.error(
          "Ocorreu um erro ao verificar a tua conta."
        );

        navigate({
          to: "/auth",
          replace: true,
        });
      } finally {
        setLoading(false);
      }
    }

    carregarPapeis();
  }, [navigate]);

  async function entrarComo(papel: Papel) {
    if (entrando) return;

    setEntrando(papel);

    try {
      /*
       * Guardamos apenas o papel escolhido para
       * esta sessão. Isto NÃO altera os papéis
       * existentes na base de dados.
       */
      sessionStorage.setItem(
        "papel_sessao",
        papel
      );

      navigate({
        to: INFORMACOES_PAPEL[papel].rota,
        replace: true,
      });
    } catch (error) {
      console.error(
        "[selecionar-papel] erro ao entrar:",
        error
      );

      toast.error(
        "Não foi possível entrar com este papel."
      );

      setEntrando(null);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-secondary px-4">
        <div className="text-center">
          <p className="text-muted-foreground">
            A verificar os teus acessos...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary px-4 py-12">
      <div className="w-full max-w-2xl">

        <Card className="shadow-lg">

          <CardHeader className="text-center">
            <CardTitle className="text-2xl">
              Como deseja entrar?
            </CardTitle>

            <CardDescription>
              A tua conta possui mais de um papel.
              Escolhe como deseja utilizar a plataforma
              nesta sessão.
            </CardDescription>
          </CardHeader>

          <CardContent>

            <div className="grid gap-4 sm:grid-cols-2">

              {papeis.map((papel) => {
                const info =
                  INFORMACOES_PAPEL[papel];

                return (
                  <Button
                    key={papel}
                    type="button"
                    variant="outline"
                    className="h-auto min-h-[170px] flex-col items-center justify-center gap-3 p-6 text-center whitespace-normal"
                    disabled={entrando !== null}
                    onClick={() =>
                      entrarComo(papel)
                    }
                  >

                    <span className="text-4xl">
                      {info.icone}
                    </span>

                    <span className="text-lg font-semibold">
                      {info.titulo}
                    </span>

                    <span className="text-sm font-normal text-muted-foreground">
                      {info.descricao}
                    </span>

                    {entrando === papel && (
                      <span className="text-xs text-muted-foreground">
                        A entrar...
                      </span>
                    )}

                  </Button>
                );
              })}

            </div>

          </CardContent>

        </Card>

      </div>
    </main>
  );
}
