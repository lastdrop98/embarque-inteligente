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
    if (!data?.token || data.token.length < 20) throw new Error("Token inválido");
    return { token: data.token };
  })
  .handler(async ({ data }): Promise<BilheteInfo | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: viagem } = await supabaseAdmin
      .from("viagens_passageiro")
      .select("id, estado, token_qr, passageiros(nome), rotas(nome, veiculos(nome)), embarque:paragens!viagens_passageiro_paragem_embarque_id_fkey(nome, hora_prevista), desembarque:paragens!viagens_passageiro_paragem_desembarque_id_fkey(nome)")
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
  .inputValidator((data: { token: string; rotaId: string; paragemId: string; tipo: "embarque" | "desembarque" }) => {
    if (!data?.token) throw new Error("Token em falta");
    if (!data?.rotaId) throw new Error("Rota em falta");
    if (data.tipo !== "embarque" && data.tipo !== "desembarque") throw new Error("Tipo inválido");
    return data;
  })
  .handler(async ({ data, context }): Promise<ResultadoScan> => {
    const { supabase, userId } = context;
    const token = data.token.trim();

    const registar = async (aprovado: boolean, viagemId: string | null, motivo?: string): Promise<ResultadoScan> => {
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

    const { data: viagem } = await supabase
      .from("viagens_passageiro")
      .select("id, rota_id, estado, paragem_embarque_id, paragem_desembarque_id, passageiros(nome)")
      .eq("token_qr", token)
      .maybeSingle();

    if (!viagem) {
      return registar(false, null, "Bilhete não encontrado nesta rota. Confirme o código e o autocarro atribuído.");
    }

    if (viagem.rota_id !== data.rotaId) {
      // Só revela o veículo correcto se o motorista estiver autorizado a consultar a rota de destino.
      const { data: rotaCorrecta } = await supabase
        .from("rotas")
        .select("id, nome, motorista_id, veiculos(nome)")
        .eq("id", viagem.rota_id)
        .maybeSingle();
      const veiculo = rotaCorrecta?.veiculos as unknown as { nome: string } | null;
      const podeVer = rotaCorrecta && rotaCorrecta.motorista_id === userId;
      const detalhe = podeVer
        ? " Rota correcta: " + rotaCorrecta.nome + (veiculo?.nome ? " — autocarro correcto: " + veiculo.nome + "." : ".")
        : " Confirme com o operador qual é o autocarro correcto.";
      return { ...(await registar(false, viagem.id, "Este passageiro não está inscrito na rota/autocarro seleccionado." + detalhe)) };
    }

    const nome = (viagem.passageiros as unknown as { nome: string } | null)?.nome ?? "Passageiro";
    const { data: rota } = await supabase.from("rotas").select("estado").eq("id", data.rotaId).maybeSingle();

    if (!rota) return { ...(await registar(false, viagem.id, "Rota não encontrada.")), passageiro: nome };
    if (data.tipo === "embarque" && !["embarque_aberto", "em_curso"].includes(rota.estado)) {
      return { ...(await registar(false, viagem.id, "O embarque não está aberto nesta rota.")), passageiro: nome };
    }
    if (data.tipo === "desembarque" && rota.estado !== "em_curso") {
      return { ...(await registar(false, viagem.id, "O desembarque só pode ser registado durante a viagem.")), passageiro: nome };
    }

    if (data.tipo === "embarque") {
      if (viagem.estado === "a_bordo") return { ...(await registar(false, viagem.id, "Embarque já efectuado.")), passageiro: nome };
      if (viagem.estado !== "pendente") return { ...(await registar(false, viagem.id, "Viagem já concluída ou recusada.")), passageiro: nome };
      if (data.paragemId && viagem.paragem_embarque_id !== data.paragemId) {
        return { ...(await registar(false, viagem.id, "Paragem de embarque errada.")), passageiro: nome };
      }
      const { error } = await supabase.from("viagens_passageiro").update({ estado: "a_bordo" }).eq("id", viagem.id).eq("estado", "pendente");
      if (error) return { ...(await registar(false, viagem.id, "Não foi possível registar.")), passageiro: nome };
      return { ...(await registar(true, viagem.id)), passageiro: nome };
    }

    if (viagem.estado !== "a_bordo") return { ...(await registar(false, viagem.id, "Passageiro não está a bordo.")), passageiro: nome };
    if (data.paragemId && viagem.paragem_desembarque_id !== data.paragemId) {
      return { ...(await registar(false, viagem.id, "Paragem de desembarque errada.")), passageiro: nome };
    }
    const { error } = await supabase.from("viagens_passageiro").update({ estado: "desembarcado" }).eq("id", viagem.id).eq("estado", "a_bordo");
    if (error) return { ...(await registar(false, viagem.id, "Não foi possível registar.")), passageiro: nome };
    return { ...(await registar(true, viagem.id)), passageiro: nome };
  });
