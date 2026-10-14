import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

import {
  useSessao,
  type Papel,
} from "@/lib/useSessao";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { Badge } from "@/components/ui/badge";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { Switch } from "@/components/ui/switch";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { toast } from "sonner";

import MapaVeiculos from "@/components/MapaVeiculos";

export const Route = createFileRoute(
  "/_authenticated/admin"
)({
  head: () => ({
    meta: [
      {
        title:
          "Administração — PickApp Mobility",
      },
      {
        name: "description",
        content:
          "Gestão de utilizadores, papéis e visão global da plataforma.",
      },
    ],
  }),

  component: AdminPage,
});

const PAPEIS: Papel[] = [
  "admin",
  "operador",
  "motorista",
  "passageiro",
  "responsavel_grupo",
];

const ROTULO_PAPEL: Record<Papel, string> = {
  admin: "Admin",
  operador: "Operador",
  motorista: "Motorista",
  passageiro: "Passageiro",
  responsavel_grupo: "Resp. Grupo",
};

type PerfilRow = {
  id: string;
  nome: string;
  email: string;
  activo: boolean;
};

type PapelRow = {
  id: string;
  user_id: string;
  role: Papel;
};

function useInvalidateAdmin() {
  const queryClient = useQueryClient();

  return (...keys: string[]) => {
    keys.forEach((key) => {
      queryClient.invalidateQueries({
        queryKey: [key],
      });
    });
  };
}

/* =========================================================
   ADMIN
========================================================= */

function AdminPage() {
  const {
    data: sessao,
    isLoading: aCarregarSessao,
  } = useSessao();

  if (aCarregarSessao) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="rounded-2xl border bg-card px-8 py-7 text-center shadow-sm">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
          <p className="mt-4 text-base font-semibold text-foreground">A carregar administração…</p>
          <p className="mt-1 text-sm text-muted-foreground">A verificar a sessão e as permissões.</p>
        </div>
      </div>
    );
  }

  if (sessao?.papel !== "admin") {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-center text-sm text-destructive">
        Acesso restrito a administradores.
      </div>
    );
  }

  return (
    <div className="space-y-8">

      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Administração
        </h1>

        <p className="text-sm text-muted-foreground">
          Utilizadores, papéis, mapa geral e auditoria.
        </p>
      </div>

      <Kpis />

      <MapaGeral />

      <Utilizadores
        utilizadorAtualId={sessao.user.id}
      />

      <PontosPredefinidos />
      <LimpezaApresentacao />

      <Incidentes />

      <Auditoria />

    </div>
  );
}

/* =========================================================
   KPIs
========================================================= */

function Kpis() {
  const { data } = useQuery({
    queryKey: ["admin-kpis"],

    queryFn: async () => {
      const inicioHoje = new Date();

      inicioHoje.setHours(
        0,
        0,
        0,
        0
      );

      const [
        veiculos,
        rotas,
        passageiros,
        bilhetesHoje,
        rotasOcupacao,
        incidentesAbertos,
      ] = await Promise.all([
        supabase
          .from("veiculos")
          .select("id, estado"),

        supabase
          .from("rotas")
          .select("id", {
            count: "exact",
            head: true,
          }),

        supabase
          .from("passageiros")
          .select("id", {
            count: "exact",
            head: true,
          }),

        supabase
          .from("viagens_passageiro")
          .select("id", {
            count: "exact",
            head: true,
          })
          .gte(
            "created_at",
            inicioHoje.toISOString()
          ),

        supabase
          .from("rotas")
          .select(
            "veiculos(lugares), viagens_passageiro(estado)"
          ),

        supabase
          .from("incidentes")
          .select("id", {
            count: "exact",
            head: true,
          })
          .eq(
            "estado",
            "aberto"
          ),
      ]);

      const veiculosActivos =
        (veiculos.data ?? []).filter(
          (v) =>
            v.estado ===
            "em_rota"
        ).length;

      let somaOcupacao = 0;

      let nRotasComVeiculo = 0;

      for (
        const r of
          (rotasOcupacao.data ??
            []) as unknown as {
            veiculos:
              | {
                  lugares: number;
                }
              | null;

            viagens_passageiro:
              {
                estado: string;
              }[];
          }[]
      ) {
        if (
          !r.veiculos?.lugares
        ) {
          continue;
        }

        const aBordo =
          r.viagens_passageiro.filter(
            (v) =>
              v.estado ===
              "a_bordo"
          ).length;

        somaOcupacao +=
          aBordo /
          r.veiculos.lugares;

        nRotasComVeiculo++;
      }

      const ocupacaoMedia =
        nRotasComVeiculo
          ? Math.round(
              (somaOcupacao /
                nRotasComVeiculo) *
                100
            )
          : null;

      return {
        veiculosActivos,
        totalRotas:
          rotas.count ?? 0,
        totalPassageiros:
          passageiros.count ?? 0,
        bilhetesHoje:
          bilhetesHoje.count ?? 0,
        ocupacaoMedia,
        incidentesAbertos:
          incidentesAbertos.count ??
          0,
      };
    },

    refetchInterval: 20000,
  });

  const cartoes = [
    {
      label: "Veículos em rota",
      valor:
        data?.veiculosActivos ??
        "—",
    },

    {
      label: "Rotas",
      valor:
        data?.totalRotas ??
        "—",
    },

    {
      label: "Passageiros",
      valor:
        data?.totalPassageiros ??
        "—",
    },

    {
      label: "Bilhetes hoje",
      valor:
        data?.bilhetesHoje ??
        "—",
    },

    {
      label: "Ocupação média",
      valor:
        data?.ocupacaoMedia !=
        null
          ? `${data.ocupacaoMedia}%`
          : "sem dados",
    },

    {
      label: "Incidentes abertos",
      valor:
        data?.incidentesAbertos ??
        "—",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">

      {cartoes.map((c) => (
        <Card key={c.label}>
          <CardContent className="p-4">

            <p className="text-2xl font-bold">
              {c.valor}
            </p>

            <p className="text-xs text-muted-foreground">
              {c.label}
            </p>

          </CardContent>
        </Card>
      ))}

    </div>
  );
}

/* =========================================================
   MAPA GERAL
========================================================= */

function MapaGeral() {
  const { data } = useQuery({
    queryKey: [
      "admin-mapa-veiculos",
    ],

    queryFn: async () => {
      const {
        data,
        error,
      } = await supabase
        .from("veiculos")
        .select(
          "id, nome, latitude, longitude, estado, posicao_updated_at"
        );

      if (error) {
        throw error;
      }

      return data;
    },

    refetchInterval: 10000,
  });

  return (
    <Card>

      <CardHeader>
        <CardTitle className="text-base">
          Veículos em circulação
        </CardTitle>
      </CardHeader>

      <CardContent>

        <MapaVeiculos
          veiculos={data ?? []}
          altura={360}
        />

      </CardContent>

    </Card>
  );
}

/* =========================================================
   UTILIZADORES
========================================================= */

function Utilizadores({
  utilizadorAtualId,
}: {
  utilizadorAtualId: string;
}) {
  const invalidate =
    useInvalidateAdmin();

  const queryClient =
    useQueryClient();

  /* -------------------------------------------------------
     PERFIS
  ------------------------------------------------------- */

  const {
    data: perfis,
  } = useQuery({
    queryKey: [
      "admin-perfis",
    ],

    queryFn: async () => {
      const {
        data,
        error,
      } = await supabase
        .from("perfis")
        .select(
          "id, nome, email, activo"
        )
        .order("nome");

      if (error) {
        throw error;
      }

      return data as PerfilRow[];
    },
  });

  /* -------------------------------------------------------
     PAPÉIS
  ------------------------------------------------------- */

  const {
    data: papeis,
  } = useQuery({
    queryKey: [
      "admin-papeis",
    ],

    queryFn: async () => {
      const {
        data,
        error,
      } = await supabase
        .from("papeis_utilizador")
        .select(
          "id, user_id, role"
        );

      if (error) {
        throw error;
      }

      return data as PapelRow[];
    },
  });

  /* -------------------------------------------------------
     AGRUPAR PAPÉIS POR UTILIZADOR
  ------------------------------------------------------- */

  const papeisPorUtilizador =
    useMemo(() => {
      const mapa =
        new Map<
          string,
          Papel[]
        >();

      for (
        const papel of
          papeis ?? []
      ) {
        const lista =
          mapa.get(
            papel.user_id
          ) ?? [];

        lista.push(
          papel.role
        );

        mapa.set(
          papel.user_id,
          lista
        );
      }

      return mapa;
    }, [papeis]);

  /* -------------------------------------------------------
     ALTERAR PAPEL
  ------------------------------------------------------- */

  const alterarPapel =
    useMutation({
      mutationFn: async ({
        userId,
        papel,
        adicionar,
      }: {
        userId: string;
        papel: Papel;
        adicionar: boolean;
      }) => {

        /*
         * Impede o administrador
         * de remover o seu próprio
         * último papel admin.
         */
        if (
          userId ===
            utilizadorAtualId &&
          papel === "admin" &&
          !adicionar
        ) {
          const papeisDoUtilizador =
            papeisPorUtilizador.get(
              userId
            ) ?? [];

          const quantidadeAdmin =
            papeisDoUtilizador.filter(
              (p) =>
                p === "admin"
            ).length;

          if (
            quantidadeAdmin <= 1
          ) {
            throw new Error(
              "Não podes remover o teu próprio último papel de administrador."
            );
          }
        }

        /*
         * ADICIONAR PAPEL
         */
        if (adicionar) {
          const {
            error,
          } = await supabase
            .from(
              "papeis_utilizador"
            )
            .insert({
              user_id:
                userId,
              role: papel,
            });

          /*
           * 23505 = duplicado.
           *
           * Se o papel já existir,
           * consideramos a operação
           * como concluída.
           */
          if (
            error &&
            error.code !==
              "23505"
          ) {
            throw error;
          }

          return;
        }

        /*
         * REMOVER PAPEL
         */
        const {
          error,
        } = await supabase
          .from(
            "papeis_utilizador"
          )
          .delete()
          .eq(
            "user_id",
            userId
          )
          .eq(
            "role",
            papel
          );

        if (error) {
          throw error;
        }
      },

      onSuccess: (
        _data,
        variables
      ) => {
        toast.success(
          variables.adicionar
            ? `${ROTULO_PAPEL[variables.papel]} atribuído com sucesso.`
            : `${ROTULO_PAPEL[variables.papel]} removido com sucesso.`
        );

        invalidate(
          "admin-papeis"
        );

        /*
         * Actualiza também
         * a sessão caso o próprio
         * administrador tenha
         * alterado os seus papéis.
         */
        queryClient.invalidateQueries(
          {
            queryKey: [
              "sessao",
            ],
          }
        );
      },

      onError: (
        error: Error
      ) => {
        console.error(
          "[admin] erro ao alterar papel:",
          error
        );

        toast.error(
          error.message ||
            "Não foi possível alterar o papel."
        );
      },
    });

  /* -------------------------------------------------------
     ACTIVAR / SUSPENDER CONTA
  ------------------------------------------------------- */

  const alternarActivo =
    useMutation({
      mutationFn: async ({
        userId,
        activo,
      }: {
        userId: string;
        activo: boolean;
      }) => {
        const {
          error,
        } = await supabase
          .from("perfis")
          .update({
            activo,
          })
          .eq(
            "id",
            userId
          );

        if (error) {
          throw error;
        }
      },

      onSuccess: (
        _data,
        variables
      ) => {
        toast.success(
          variables.activo
            ? "Conta activada."
            : "Conta suspensa."
        );

        invalidate(
          "admin-perfis"
        );

        queryClient.invalidateQueries(
          {
            queryKey: [
              "sessao",
            ],
          }
        );
      },

      onError: (
        error: Error
      ) => {
        toast.error(
          error.message ||
            "Não foi possível actualizar o estado da conta."
        );
      },
    });

  return (
    <Card>

      <CardHeader>

        <CardTitle className="text-base">
          Gestão de utilizadores
        </CardTitle>

        <p className="text-sm text-muted-foreground">
          Atribui ou remove um ou vários papéis para cada utilizador.
        </p>

      </CardHeader>

      <CardContent>

        <div className="overflow-x-auto">

          <Table>

            <TableHeader>

              <TableRow>

                <TableHead>
                  Nome
                </TableHead>

                <TableHead>
                  Email
                </TableHead>

                <TableHead>
                  Papéis
                </TableHead>

                <TableHead>
                  Estado
                </TableHead>

              </TableRow>

            </TableHeader>

            <TableBody>

              {perfis?.map(
                (perfil) => {
                  const papeisDoUtilizador =
                    papeisPorUtilizador.get(
                      perfil.id
                    ) ?? [];

                  return (
                    <TableRow
                      key={
                        perfil.id
                      }
                    >

                      {/* NOME */}

                      <TableCell className="min-w-[170px] font-medium">

                        <div className="flex flex-wrap items-center gap-2">

                          <span>
                            {perfil.nome ||
                              "—"}
                          </span>

                          {perfil.id ===
                            utilizadorAtualId && (
                            <Badge variant="secondary">
                              tu
                            </Badge>
                          )}

                        </div>

                      </TableCell>

                      {/* EMAIL */}

                      <TableCell className="min-w-[220px] text-muted-foreground">
                        {perfil.email}
                      </TableCell>

                      {/* PAPÉIS */}

                      <TableCell className="min-w-[330px]">

                        <div className="flex flex-wrap gap-2">

                          {PAPEIS.map(
                            (papel) => {
                              const activo =
                                papeisDoUtilizador.includes(
                                  papel
                                );

                              const ehUltimoAdminDoProprioUtilizador =
                                perfil.id ===
                                  utilizadorAtualId &&
                                papel ===
                                  "admin" &&
                                activo &&
                                papeisDoUtilizador.filter(
                                  (p) =>
                                    p ===
                                    "admin"
                                ).length ===
                                  1;

                              return (
                                <Button
                                  key={
                                    papel
                                  }
                                  type="button"
                                  size="sm"
                                  variant={
                                    activo
                                      ? "default"
                                      : "outline"
                                  }
                                  disabled={
                                    alterarPapel.isPending ||
                                    ehUltimoAdminDoProprioUtilizador
                                  }
                                  onClick={() =>
                                    alterarPapel.mutate(
                                      {
                                        userId:
                                          perfil.id,

                                        papel,

                                        adicionar:
                                          !activo,
                                      }
                                    )
                                  }
                                  title={
                                    ehUltimoAdminDoProprioUtilizador
                                      ? "Não podes remover o teu próprio último papel de administrador."
                                      : activo
                                      ? `Remover ${ROTULO_PAPEL[papel]}`
                                      : `Atribuir ${ROTULO_PAPEL[papel]}`
                                  }
                                >
                                  {activo
                                    ? "✓ "
                                    : "+ "}

                                  {
                                    ROTULO_PAPEL[
                                      papel
                                    ]
                                  }
                                </Button>
                              );
                            }
                          )}

                        </div>

                        <div className="mt-2 flex flex-wrap gap-1">

                          {papeisDoUtilizador.length >
                          0 ? (
                            papeisDoUtilizador.map(
                              (papel) => (
                                <Badge
                                  key={
                                    papel
                                  }
                                  variant="secondary"
                                >
                                  {
                                    ROTULO_PAPEL[
                                      papel
                                    ]
                                  }
                                </Badge>
                              )
                            )
                          ) : (
                            <span className="text-xs text-destructive">
                              Sem papel atribuído
                            </span>
                          )}

                        </div>

                      </TableCell>

                      {/* ESTADO */}

                      <TableCell>

                        <div className="flex items-center gap-2">

                          <Switch
                            checked={
                              perfil.activo
                            }
                            disabled={
                              perfil.id ===
                                utilizadorAtualId ||
                              alternarActivo.isPending
                            }
                            onCheckedChange={(
                              valor
                            ) =>
                              alternarActivo.mutate(
                                {
                                  userId:
                                    perfil.id,

                                  activo:
                                    valor,
                                }
                              )
                            }
                          />

                          <span className="text-xs text-muted-foreground">
                            {perfil.activo
                              ? "Activo"
                              : "Suspenso"}
                          </span>

                        </div>

                      </TableCell>

                    </TableRow>
                  );
                }
              )}

              {!perfis?.length && (
                <TableRow>

                  <TableCell
                    colSpan={4}
                    className="text-center text-sm text-muted-foreground"
                  >
                    Sem utilizadores.
                  </TableCell>

                </TableRow>
              )}

            </TableBody>

          </Table>

        </div>

      </CardContent>

    </Card>
  );
}

/* =========================================================
   PONTOS PREDEFINIDOS
========================================================= */

function PontosPredefinidos() {
  const qc = useQueryClient();
  const { data: pontos } = useQuery({
    queryKey: ["admin-pontos-predefinidos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pontos_predefinidos")
        .select("id, nome, activo, latitude, longitude, coordenadas_verificadas")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const [editId, setEditId] = useState<string | null>(null);
  const [novoPonto, setNovoPonto] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [localizacaoConfirmada, setLocalizacaoConfirmada] = useState(false);

  const limpar = () => {
    setEditId(null);
    setNovoPonto("");
    setLatitude("");
    setLongitude("");
    setLocalizacaoConfirmada(false);
  };

  const guardar = useMutation({
    mutationFn: async () => {
      const nome = novoPonto.trim();
      const lat = Number(latitude);
      const lng = Number(longitude);
      if (!nome) throw new Error("Indica o nome do ponto.");
      if (!localizacaoConfirmada || !latitude.trim() || !longitude.trim() || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new Error("Escolhe a localização do ponto no mapa antes de guardar.");
      }
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        throw new Error("As coordenadas estão fora dos limites válidos.");
      }
      const campos = {
        nome,
        latitude: lat,
        longitude: lng,
        coordenadas_verificadas: true,
      };
      const nomeAnterior = editId ? pontos?.find((p) => p.id === editId)?.nome : null;
      const { error } = editId
        ? await supabase.from("pontos_predefinidos").update(campos).eq("id", editId)
        : await supabase.from("pontos_predefinidos").insert({ ...campos, activo: true });
      if (error) throw error;
      const { error: erroParagens } = await supabase
        .from("paragens")
        .update({ nome, latitude: lat, longitude: lng })
        .eq("nome", nomeAnterior ?? nome);
      return { erroSincronizarParagens: erroParagens?.message ?? null };
    },
    onSuccess: ({ erroSincronizarParagens }) => {
      toast.success(editId ? "Ponto actualizado com coordenadas verificadas." : "Ponto criado com coordenadas verificadas.");
      if (erroSincronizarParagens) toast.warning("O ponto foi guardado, mas algumas paragens de rotas antigas não foram actualizadas. Reveja as permissões e sincronize-as manualmente.");
      limpar();
      qc.invalidateQueries({ queryKey: ["admin-pontos-predefinidos"] });
      qc.invalidateQueries({ queryKey: ["pontos-predefinidos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const alternar = useMutation({
    mutationFn: async ({ id, activo }: { id: string; activo: boolean }) => {
      const { error } = await supabase.from("pontos_predefinidos").update({ activo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-pontos-predefinidos"] });
      qc.invalidateQueries({ queryKey: ["pontos-predefinidos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const eliminar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pontos_predefinidos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ponto removido.");
      qc.invalidateQueries({ queryKey: ["admin-pontos-predefinidos"] });
      qc.invalidateQueries({ queryKey: ["pontos-predefinidos"] });
    },
    onError: (e: Error) => toast.error(e.message.includes("foreign key") || e.message.includes("violates") ? "Não é possível remover este ponto porque está associado a rotas ou viagens. Desactive-o para impedir novas utilizações." : e.message),
  });

  const lat = latitude.trim() ? Number(latitude) : null;
  const lng = longitude.trim() ? Number(longitude) : null;
  const temCoordenadas = localizacaoConfirmada && lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{editId ? "Editar ponto de embarque/desembarque" : "Pontos de embarque/desembarque"}</CardTitle>
        <p className="text-sm text-muted-foreground">
          Cada ponto precisa de coordenadas seleccionadas no mapa. Os pontos antigos sem coordenadas devem ser editados e posicionados antes de serem considerados verificados.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Nome do ponto</label>
            <Input placeholder="Ex.: Terminal ou paragem" value={novoPonto} onChange={(e) => setNovoPonto(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Latitude</label>
              <Input inputMode="decimal" type="number" min={-90} max={90} step="any" placeholder="-25.9655" value={latitude} onChange={(e) => { setLatitude(e.target.value); setLocalizacaoConfirmada(false); }} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Longitude</label>
              <Input inputMode="decimal" type="number" min={-180} max={180} step="any" placeholder="32.5832" value={longitude} onChange={(e) => { setLongitude(e.target.value); setLocalizacaoConfirmada(false); }} />
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Selecciona a posição real no mapa</p>
          <p className="text-xs text-muted-foreground">Clica directamente no local correcto. O mapa não escolhe coordenadas automaticamente nem confirma o nome do local.</p>
          <MapaVeiculos
            altura={320}
            paragens={temCoordenadas ? [{ id: editId ?? "novo-ponto", nome: novoPonto || "Ponto seleccionado", ordem: 1, latitude: lat, longitude: lng, destaque: true }] : []}
            onCliqueMapa={(latClicada, lngClicada) => {
              setLatitude(latClicada.toFixed(6));
              setLongitude(lngClicada.toFixed(6));
              setLocalizacaoConfirmada(true);
            }}
          />
          <p className="text-xs text-muted-foreground">
            {temCoordenadas ? `Posição seleccionada: ${lat!.toFixed(6)}, ${lng!.toFixed(6)}` : "Ainda não foi seleccionada uma posição válida."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!novoPonto.trim() || !temCoordenadas || guardar.isPending} onClick={() => guardar.mutate()}>
            {guardar.isPending ? "A guardar..." : editId ? "Guardar alterações" : "Adicionar ponto"}
          </Button>
          <Button variant="ghost" onClick={limpar}>{editId ? "Cancelar edição" : "Limpar campos"}</Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {pontos?.map((p) => (
            <div key={p.id} className="space-y-2 rounded-md border px-3 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={p.activo ? "font-medium" : "text-muted-foreground line-through"}>{p.nome}</span>
                <Badge variant={p.coordenadas_verificadas && p.latitude !== null && p.longitude !== null ? "secondary" : "destructive"}>
                  {p.coordenadas_verificadas && p.latitude !== null && p.longitude !== null ? "Coordenadas verificadas" : "Localização por definir"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {p.latitude !== null && p.longitude !== null ? `${p.latitude.toFixed(6)}, ${p.longitude.toFixed(6)}` : "Sem coordenadas guardadas"}
              </p>
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="outline" onClick={() => {
                  setEditId(p.id);
                  setNovoPonto(p.nome);
                  setLatitude(p.latitude === null ? "" : String(p.latitude));
                  setLongitude(p.longitude === null ? "" : String(p.longitude));
                  setLocalizacaoConfirmada(Boolean(p.coordenadas_verificadas && p.latitude !== null && p.longitude !== null));
                }}>Editar / posicionar</Button>
                <Button size="sm" variant="outline" disabled={alternar.isPending} onClick={() => alternar.mutate({ id: p.id, activo: !p.activo })}>
                  {p.activo ? "Desactivar" : "Activar"}
                </Button>
                <Button size="sm" variant="destructive" disabled={eliminar.isPending} onClick={() => {
                  if (window.confirm(`Remover o ponto "${p.nome}"? Se estiver associado a rotas ou viagens, a base de dados impedirá a remoção.`)) eliminar.mutate(p.id);
                }}>Eliminar</Button>
              </div>
            </div>
          ))}
          {!pontos?.length && <p className="text-sm text-muted-foreground">Ainda não existem pontos predefinidos.</p>}
        </div>
      </CardContent>
    </Card>
  );
}

/* =========================================================
   LIMPEZA DA APRESENTAÇÃO
========================================================= */

function LimpezaApresentacao() {
  const qc = useQueryClient();
  const limpar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("limpar_dados_apresentacao");
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Dados operacionais, histórico, rotas e pontos foram limpos.");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="text-base">Preparar nova apresentação</CardTitle>
        <p className="text-sm text-muted-foreground">
          Remove dados operacionais, histórico, rotas, pedidos, viagens, incidentes, veículos, delegações e pontos predefinidos. As contas e papéis de acesso são preservados.
        </p>
      </CardHeader>
      <CardContent>
        <Button variant="destructive" disabled={limpar.isPending} onClick={() => {
          if (window.confirm("ATENÇÃO: isto vai eliminar todos os dados operacionais e históricos da plataforma. As contas e papéis serão preservados. Continuar?")) {
            limpar.mutate();
          }
        }}>
          {limpar.isPending ? "A limpar..." : "Limpar dados da apresentação"}
        </Button>
      </CardContent>
    </Card>
  );
}

/* =========================================================
   INCIDENTES
========================================================= */

function Incidentes() {
  const invalidate =
    useInvalidateAdmin();

  const { data } =
    useQuery({
      queryKey: [
        "admin-incidentes",
      ],

      queryFn: async () => {
        const {
          data,
          error,
        } = await supabase
          .from("incidentes")
          .select(
            "id, descricao, estado, created_at, rota_id, motorista_id, rotas(nome)"
          )
          .order(
            "created_at",
            {
              ascending: false,
            }
          );

        if (error) {
          throw error;
        }

        return data;
      },
    });

  const resolver =
    useMutation({
      mutationFn:
        async (
          id: string
        ) => {
          const {
            error,
          } = await supabase
            .from(
              "incidentes"
            )
            .update({
              estado:
                "resolvido",
            })
            .eq(
              "id",
              id
            );

          if (error) {
            throw error;
          }
        },

      onSuccess: () => {
        toast.success(
          "Incidente marcado como resolvido."
        );

        invalidate(
          "admin-incidentes"
        );

        invalidate(
          "admin-kpis"
        );
      },

      onError: (
        error: Error
      ) => {
        toast.error(
          error.message ||
            "Não foi possível resolver o incidente."
        );
      },
    });

  return (
    <Card>

      <CardHeader>

        <CardTitle className="text-base">
          Incidentes
        </CardTitle>

      </CardHeader>

      <CardContent className="space-y-2">

        {data?.length ? (
          data.map(
            (incidente) => (
              <div
                key={
                  incidente.id
                }
                className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-sm"
              >

                <Badge
                  variant={
                    incidente.estado ===
                    "aberto"
                      ? "destructive"
                      : "secondary"
                  }
                >
                  {
                    incidente.estado
                  }
                </Badge>

                <span className="font-medium">
                  {
                    (
                      incidente.rotas as
                        | {
                            nome: string;
                          }
                        | null
                    )?.nome ??
                    "Rota desconhecida"
                  }
                </span>

                <span className="text-muted-foreground">
                  {
                    incidente.descricao
                  }
                </span>

                <span className="text-xs text-muted-foreground">
                  {new Date(
                    incidente.created_at
                  ).toLocaleString(
                    "pt-PT"
                  )}
                </span>

                {incidente.estado ===
                  "aberto" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto"
                    disabled={
                      resolver.isPending
                    }
                    onClick={() =>
                      resolver.mutate(
                        incidente.id
                      )
                    }
                  >
                    Marcar como resolvido
                  </Button>
                )}

              </div>
            )
          )
        ) : (
          <p className="text-sm text-muted-foreground">
            Sem incidentes reportados.
          </p>
        )}

      </CardContent>

    </Card>
  );
}

/* =========================================================
   AUDITORIA
========================================================= */

function Auditoria() {
  const {
    data: registos,
  } = useQuery({
    queryKey: [
      "admin-auditoria",
    ],

    queryFn: async () => {
      const {
        data,
        error,
      } = await supabase
        .from(
          "registo_auditoria"
        )
        .select("*")
        .order(
          "created_at",
          {
            ascending: false,
          }
        )
        .limit(50);

      if (error) {
        throw error;
      }

      return data;
    },
  });

  const {
    data: perfis,
  } = useQuery({
    queryKey: [
      "admin-perfis",
    ],

    queryFn: async () => {
      const {
        data,
        error,
      } = await supabase
        .from("perfis")
        .select(
          "id, nome, email, activo"
        )
        .order("nome");

      if (error) {
        throw error;
      }

      return data as PerfilRow[];
    },
  });

  const nomePorId =
    useMemo(() => {
      const mapa =
        new Map<
          string,
          string
        >();

      (
        perfis ?? []
      ).forEach(
        (perfil) => {
          mapa.set(
            perfil.id,
            perfil.nome ||
              perfil.email
          );
        }
      );

      return mapa;
    }, [perfis]);

  return (
    <Card>

      <CardHeader>

        <CardTitle className="text-base">
          Registo de auditoria
        </CardTitle>

      </CardHeader>

      <CardContent className="space-y-2">

        {registos?.length ? (
          registos.map(
            (registo) => (
              <div
                key={
                  registo.id
                }
                className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-xs"
              >

                <span className="font-medium">
                  {
                    nomePorId.get(
                      registo.utilizador_alvo
                    ) ??
                    registo.utilizador_alvo
                  }
                </span>

                <span className="text-muted-foreground">
                  {
                    registo.papel_anterior ??
                    "—"
                  }

                  {" → "}

                  {
                    registo.papel_novo ??
                    "removido"
                  }
                </span>

                <span className="ml-auto text-muted-foreground">
                  por{" "}
                  {registo.alterado_por
                    ? nomePorId.get(
                        registo.alterado_por
                      ) ??
                      registo.alterado_por
                    : "sistema"}

                  {" · "}

                  {new Date(
                    registo.created_at
                  ).toLocaleString(
                    "pt-PT"
                  )}
                </span>

              </div>
            )
          )
        ) : (
          <p className="text-sm text-muted-foreground">
            Sem alterações registadas.
          </p>
        )}

      </CardContent>

    </Card>
  );
}
