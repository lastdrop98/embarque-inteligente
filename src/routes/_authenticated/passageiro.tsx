import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSessao } from "@/lib/useSessao";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { BilhetePass, type DadosBilhete } from "@/components/BilhetePass";
import MapaVeiculos, { type PosVeiculo, type PosParagem } from "@/components/MapaVeiculos";
import { PassageiroPedidos } from "@/components/PassageiroPedidos";

export const Route = createFileRoute("/_authenticated/passageiro")({
  head: () => ({
    meta: [
      { title: "Os meus bilhetes — Rotas & Embarque QR" },
      { name: "description", content: "Bilhetes activos, histórico de viagens e acompanhamento em tempo real." },
    ],
  }),
  component: PassageiroPage,
});

type ViagemRow = {
  id: string;
  estado: string;
  token_qr: string;
  created_at: string;
  passageiros: { nome: string } | null;
  rotas: { nome: string; data_servico: string | null; veiculos: (PosVeiculo & { lugares: number }) | null } | null;
  embarque: (PosParagem & { hora_prevista: string | null }) | null;
  desembarque: { nome: string } | null;
};

function usePassageiroId(userId: string) {
  return useQuery({
    queryKey: ["meu-passageiro", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("passageiros").select("id, nome, categoria").eq("user_id", userId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

function PassageiroPage() {
  const { data: sessao, isLoading: aCarregarSessao } = useSessao();
  if (aCarregarSessao) return null;
  if (!sessao?.user) return null;
  return <Conteudo userId={sessao.user.id} />;
}

function Conteudo({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const { data: passageiro } = usePassageiroId(userId);

  const { data: viagens } = useQuery({
    queryKey: ["minhas-viagens", passageiro?.id],
    enabled: !!passageiro?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("viagens_passageiro")
        .select(
          "id, estado, token_qr, created_at, passageiros(nome), rotas(nome, data_servico, veiculos(id, nome, lugares, latitude, longitude, estado, posicao_updated_at)), embarque:paragens!viagens_passageiro_paragem_embarque_id_fkey(id, nome, ordem, hora_prevista, latitude, longitude), desembarque:paragens!viagens_passageiro_paragem_desembarque_id_fkey(nome)",
        )
        .eq("passageiro_id", passageiro!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as ViagemRow[];
    },
  });

  useEffect(() => {
    if (!passageiro?.id) return;

    const canalViagens = supabase
      .channel("minhas-viagens-" + passageiro.id)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "viagens_passageiro", filter: `passageiro_id=eq.${passageiro.id}` },
        () => qc.invalidateQueries({ queryKey: ["minhas-viagens", passageiro.id] }),
      )
      .subscribe();

    const canalVeiculos = supabase
      .channel("posicao-veiculos-" + passageiro.id)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "veiculos" },
        (payload) => {
          const viagemActiva = (qc.getQueryData<ViagemRow[]>(["minhas-viagens", passageiro.id]) ?? []).some(
            (v) => v.estado === "pendente" || v.estado === "a_bordo"
          );
          if (viagemActiva) {
            qc.invalidateQueries({ queryKey: ["minhas-viagens", passageiro.id] });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canalViagens);
      supabase.removeChannel(canalVeiculos);
    };
  }, [passageiro?.id, qc]);

  const { data: avaliacoes } = useQuery({
    queryKey: ["minhas-avaliacoes", passageiro?.id],
    enabled: !!viagens?.length,
    queryFn: async () => {
      const ids = (viagens ?? []).map((v) => v.id);
      if (!ids.length) return [];
      const { data, error } = await supabase.from("avaliacoes").select("viagem_id").in("viagem_id", ids);
      if (error) throw error;
      return data;
    },
  });

  const idsAvaliados = useMemo(() => new Set((avaliacoes ?? []).map((a) => a.viagem_id)), [avaliacoes]);

  const activas = (viagens ?? []).filter((v) => v.estado === "pendente" || v.estado === "a_bordo");
  const historico = (viagens ?? []).filter((v) => v.estado === "concluida" || v.estado === "recusada");

  const paraDados = (v: ViagemRow): DadosBilhete => ({
    token: v.token_qr,
    passageiro: v.passageiros?.nome ?? "—",
    rota: v.rotas?.nome ?? "—",
    dataViagem: v.rotas?.data_servico ?? null,
    veiculo: v.rotas?.veiculos?.nome ?? null,
    paragemEmbarque: v.embarque?.nome ?? null,
    horaEmbarque: v.embarque?.hora_prevista ?? null,
    paragemDesembarque: v.desembarque?.nome ?? null,
    estado: v.estado,
    emitidoEm: v.created_at,
  });

  const proximaComVeiculo = activas.find((v) => v.rotas?.veiculos?.latitude != null);

  if (!passageiro) {
    return (
      <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
        Ainda não há um passageiro associado a esta conta.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Área do Passageiro</h1>
        <p className="text-sm text-muted-foreground">Solicite transporte, acompanhe pedidos e consulte os seus bilhetes.</p>
      </div>
      <PassageiroPedidos
        passageiro={{ id: passageiro.id, nome: passageiro.nome, categoria: passageiro.categoria }}
        userId={userId}
      />

      {proximaComVeiculo?.rotas?.veiculos && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">A aproximar-se</CardTitle>
          </CardHeader>
          <CardContent>
            <MapaVeiculos
              veiculos={[proximaComVeiculo.rotas.veiculos]}
              paragens={proximaComVeiculo.embarque ? [{ ...proximaComVeiculo.embarque, destaque: true }] : []}
              altura={300}
            />
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="mb-3 text-lg font-semibold">Os meus bilhetes activos</h2>
        {activas.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activas.map((v) => (
              <BilhetePass key={v.id} dados={paraDados(v)} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Sem bilhetes activos neste momento.</p>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Histórico de viagens</h2>
        {historico.length ? (
          <div className="space-y-3">
            {historico.map((v) => (
              <div key={v.id} className="space-y-2">
                <BilhetePass dados={paraDados(v)} compacto />
                {v.estado === "concluida" && !idsAvaliados.has(v.id) && (
                  <FormularioAvaliacao viagemId={v.id} passageiroId={passageiro.id} />
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Ainda não há viagens concluídas.</p>
        )}
      </div>
    </div>
  );
}

function FormularioAvaliacao({ viagemId, passageiroId }: { viagemId: string; passageiroId: string }) {
  const qc = useQueryClient();
  const [nota, setNota] = useState(5);
  const [comentario, setComentario] = useState("");

  const enviar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("avaliacoes").insert({ viagem_id: viagemId, nota, comentario: comentario || null });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Obrigado pela avaliação");
      qc.invalidateQueries({ queryKey: ["minhas-avaliacoes", passageiroId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <p className="text-sm font-medium">Como foi a viagem?</p>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setNota(n)}
              className={`h-8 w-8 rounded-md border text-sm font-semibold ${n <= nota ? "bg-primary text-primary-foreground" : "bg-background"}`}
            >
              {n}
            </button>
          ))}
        </div>
        <Textarea placeholder="Comentário (opcional)" value={comentario} onChange={(e) => setComentario(e.target.value)} />
        <Button size="sm" disabled={enviar.isPending} onClick={() => enviar.mutate()}>
          Enviar avaliação
        </Button>
      </CardContent>
    </Card>
  );
}
