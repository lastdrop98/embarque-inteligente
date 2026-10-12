import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type BilheteInfo = {
  passageiro: string;
  rota: string;
  veiculo: string | null;
  paragemEmbarque: string | null;
  horaEmbarque: string | null;
  paragemDesembarque: string | null;
  estado: string;
  token: string;
};

/** Página pública do passageiro: o token funciona como segredo. */
export const obterBilhete = createServerFn({ method: "GET" })
  .inputValidator((data: { token: string }) => {
    const token = data?.token?.trim();
    if (!token || !/^[A-Za-z0-9_-]{8,128}$/.test(token)) throw new Error("Token inválido");
    return { token };
  })
  .handler(async ({ data }): Promise<BilheteInfo | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: viagem } = await supabaseAdmin
      .from("viagens_passageiro")
      .select(
        "id, estado, token_qr, passageiros(nome), rotas(nome, veiculos(nome)), embarque:paragens!viagens_passageiro_paragem_embarque_id_fkey(nome, hora_prevista), desembarque:paragens!viagens_passageiro_paragem_desembarque_id_fkey(nome)",
      )
      .eq("token_qr", data.token)
      .maybeSingle();

    if (!viagem) return null;
    const rota = viagem.rotas as unknown as { nome: string; veiculos: { nome: string } | null } | null;
    const emb = viagem.embarque as unknown as { nome: string; hora_prevista: string | null } | null;
    const des = viagem.desembarque as unknown as { nome: string } | null;
    return {
      passageiro: (viagem.passageiros as unknown as { nome: string } | null)?.nome ?? "—",
      rota: rota?.nome ?? "—",
      veiculo: rota?.veiculos?.nome ?? null,
      paragemEmbarque: emb?.nome ?? null,
      horaEmbarque: emb?.hora_prevista ?? null,
      paragemDesembarque: des?.nome ?? null,
      estado: viagem.estado,
      token: viagem.token_qr,
    };
  });

export type ResultadoScan = {
  aprovado: boolean;
  motivo?: string;
  passageiro?: string;
  tipo: "embarque" | "desembarque";
};

/** Valida a leitura de um QR feita pelo motorista (ou operador). */
export const validarQr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { token: string; rotaId: string; paragemId: string; tipo: "embarque" | "desembarque" }) => {
      if (!data?.token) throw new Error("Token em falta");
      if (!data?.rotaId) throw new Error("Rota em falta");
      if (data.tipo !== "embarque" && data.tipo !== "desembarque") throw new Error("Tipo inválido");
      return data;
    },
  )
  .handler(async ({ data, context }): Promise<ResultadoScan> => {
    const { supabase, userId } = context;
    const token = data.token.trim();

    const registar = async (
      aprovado: boolean,
      viagemId: string | null,
      motivo?: string,
    ): Promise<ResultadoScan> => {
      await supabase.from("registos_embarque").insert({
        viagem_passageiro_id: viagemId,
        rota_id: data.rotaId,
        tipo: data.tipo,
        resultado: aprovado ? "aprovado" : "recusado",
        motivo_recusa: motivo ?? null,
        registado_por: userId,
      });
      return { aprovado, tipo: data.tipo, ...(motivo ? { motivo } : {}) };
    };

    // RLS: o motorista só consegue ler viagens das rotas que lhe estão atribuídas.
    const { data: viagem } = await supabase
      .from("viagens_passageiro")
      .select("id, rota_id, estado, paragem_embarque_id, paragem_desembarque_id, passageiros(nome)")
      .eq("token_qr", token)
      .maybeSingle();

    if (!viagem) {
      // A política RLS pode ocultar bilhetes de outra rota. Consultamos no servidor
      // apenas a atribuição do QR para informar o motorista sobre o autocarro correcto.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: bilhete } = await supabaseAdmin
        .from("viagens_passageiro")
        .select("id, rota_id, passageiros(nome)")
        .eq("token_qr", token)
        .maybeSingle();
      if (!bilhete) return registar(false, null, "Código QR desconhecido ou inválido.");
      const { data: rotaCorrecta } = await supabaseAdmin
        .from("rotas")
        .select("nome, veiculos(nome, matricula)")
        .eq("id", bilhete.rota_id)
        .maybeSingle();
      const autocarro = rotaCorrecta?.veiculos as unknown as { nome: string; matricula: string } | null;
      const identificacao = autocarro
        ? [autocarro.nome, autocarro.matricula].filter(Boolean).join(" · ")
        : "ainda não atribuído";
      const motivo = `Embarque recusado. O passageiro está inscrito no autocarro correcto: ${identificacao}${rotaCorrecta?.nome ? ` (rota ${rotaCorrecta.nome})` : ""}.`;
      const nomeBilhete = (bilhete.passageiros as unknown as { nome: string } | null)?.nome ?? "Passageiro";
      return { ...(await registar(false, bilhete.id, motivo)), passageiro: nomeBilhete };
    }
    if (viagem.rota_id !== data.rotaId) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: rotaCorrecta } = await supabaseAdmin
        .from("rotas")
        .select("nome, veiculos(nome, matricula)")
        .eq("id", viagem.rota_id)
        .maybeSingle();
      const autocarro = rotaCorrecta?.veiculos as unknown as { nome: string; matricula: string } | null;
      const identificacao = autocarro
        ? [autocarro.nome, autocarro.matricula].filter(Boolean).join(" · ")
        : "ainda não atribuído";
      const motivo = `Embarque recusado. O passageiro está inscrito no autocarro correcto: ${identificacao}${rotaCorrecta?.nome ? ` (rota ${rotaCorrecta.nome})` : ""}.`;
      return { ...(await registar(false, viagem.id, motivo)), passageiro: (viagem.passageiros as unknown as { nome: string } | null)?.nome ?? "Passageiro" };
    }

    const nome = (viagem.passageiros as unknown as { nome: string } | null)?.nome ?? "Passageiro";

    const { data: rota } = await supabase
      .from("rotas")
      .select("estado, nome, data_viagem, hora_inicio")
      .eq("id", data.rotaId)
      .maybeSingle();

    if (!rota) {
      return { ...(await registar(false, viagem.id, "Rota não encontrada.")), passageiro: nome };
    }

    // O motorista pode validar embarques enquanto a rota está em curso.
    // Isto permite iniciar o turno/GPS antes de concluir o embarque de todos os passageiros.
    if (data.tipo === "embarque" && !["embarque_aberto", "em_curso"].includes(rota.estado)) {
      return { ...(await registar(false, viagem.id, "O embarque não está aberto nesta rota.")), passageiro: nome };
    }

    if (data.tipo === "embarque" && rota.data_viagem) {
      const { data: paragemEmbarque } = viagem.paragem_embarque_id
        ? await supabase.from("paragens").select("hora_prevista").eq("id", viagem.paragem_embarque_id).maybeSingle()
        : { data: null };
      const horaEmbarque = paragemEmbarque?.hora_prevista ?? rota.hora_inicio;
      if (horaEmbarque) {
        // O servidor aplica o limite usando o fuso local de Maputo (UTC+02:00).
        const instantePartida = new Date(`${rota.data_viagem}T${horaEmbarque.slice(0, 5)}:00+02:00`).getTime();
        if (Date.now() >= instantePartida - 10 * 60 * 1000) {
          return { ...(await registar(false, viagem.id, "Embarque fechado: o embarque fecha 10 minutos antes da partida.")), passageiro: nome };
        }
      }
    }

    if (data.tipo === "desembarque" && rota.estado !== "em_curso") {
      return { ...(await registar(false, viagem.id, "O desembarque só pode ser registado durante a viagem.")), passageiro: nome };
    }

    if (data.tipo === "embarque") {
      if (viagem.estado === "a_bordo")
        return { ...(await registar(false, viagem.id, "Embarque já efectuado.")), passageiro: nome };
      if (viagem.estado !== "pendente")
        return { ...(await registar(false, viagem.id, "Viagem já concluída ou recusada.")), passageiro: nome };
      if (data.paragemId && viagem.paragem_embarque_id !== data.paragemId)
        return { ...(await registar(false, viagem.id, "Paragem de embarque errada.")), passageiro: nome };

      const { error } = await supabase
        .from("viagens_passageiro")
        .update({ estado: "a_bordo" })
        .eq("id", viagem.id)
        .eq("estado", "pendente");
      if (error) return { ...(await registar(false, viagem.id, "Não foi possível registar.")), passageiro: nome };
      return { ...(await registar(true, viagem.id)), passageiro: nome };
    }

    if (viagem.estado !== "a_bordo")
      return { ...(await registar(false, viagem.id, "Passageiro não está a bordo.")), passageiro: nome };
    if (data.paragemId && viagem.paragem_desembarque_id !== data.paragemId)
      return { ...(await registar(false, viagem.id, "Paragem de desembarque errada.")), passageiro: nome };

    const { error } = await supabase
      .from("viagens_passageiro")
      .update({ estado: "desembarcado" })
      .eq("id", viagem.id)
      .eq("estado", "a_bordo");
    if (error) return { ...(await registar(false, viagem.id, "Não foi possível registar.")), passageiro: nome };
    return { ...(await registar(true, viagem.id)), passageiro: nome };
  });
