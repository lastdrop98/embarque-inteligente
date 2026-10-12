/*
 * Som curto e discreto para novas notificações.
 *
 * Usa apenas a Web Audio API (sem ficheiros nem dependências).
 * Os navegadores móveis bloqueiam áudio antes de uma interacção
 * do utilizador, por isso o contexto só é criado depois de o
 * utilizador activar explicitamente o som.
 */

const CHAVE_SOM = "notificacoes_som";
const CHAVE_PERMISSAO_PEDIDA = "notificacoes_permissao_pedida";

let contexto: AudioContext | null = null;

function obterContexto(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!contexto) contexto = new Ctor();
  return contexto;
}

export function somActivo(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(CHAVE_SOM) === "1";
}

export function definirSom(activo: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CHAVE_SOM, activo ? "1" : "0");
  if (activo) {
    // A activação é, por si só, uma interacção do utilizador:
    // aproveitamos para desbloquear o contexto de áudio.
    const ctx = obterContexto();
    void ctx?.resume();
  }
}

export function tocarSomNotificacao() {
  if (!somActivo()) return;
  const ctx = obterContexto();
  if (!ctx) return;
  void ctx.resume().catch(() => undefined);
  try {
    const agora = ctx.currentTime;
    const osc = ctx.createOscillator();
    const ganho = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, agora);
    osc.frequency.setValueAtTime(1175, agora + 0.09);
    ganho.gain.setValueAtTime(0.0001, agora);
    ganho.gain.exponentialRampToValueAtTime(0.12, agora + 0.02);
    ganho.gain.exponentialRampToValueAtTime(0.0001, agora + 0.32);
    osc.connect(ganho).connect(ctx.destination);
    osc.start(agora);
    osc.stop(agora + 0.34);
  } catch {
    /* som é opcional — nunca deve quebrar a aplicação */
  }
}

/** Pede a permissão do sistema uma única vez por dispositivo. */
export async function pedirPermissaoAvisos() {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (window.localStorage.getItem(CHAVE_PERMISSAO_PEDIDA) === "1") return;
  window.localStorage.setItem(CHAVE_PERMISSAO_PEDIDA, "1");
  if (Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch {
      /* ignorar */
    }
  }
}

export function mostrarAvisoSistema(mensagem: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  if (typeof document !== "undefined" && document.visibilityState === "visible") return;
  try {
    new Notification("Embarque Inteligente", { body: mensagem });
  } catch {
    /* ignorar */
  }
}
