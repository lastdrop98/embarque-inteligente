import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Volume2, VolumeX, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

type Notificacao = {
  id: string;
  tipo: string;
  mensagem: string;
  lida: boolean;
  created_at: string;
};

export function SinoNotificacoes({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [somAtivo, setSomAtivo] = useState(() => localStorage.getItem("som_notificacoes") === "1");
  const touchStartX = useRef<number | null>(null);

  const { data } = useQuery({
    queryKey: ["notificacoes", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notificacoes")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as Notificacao[];
    },
  });

  function tocarSom() {
    if (!somAtivo) return;
    try {
      const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const ganho = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      ganho.gain.setValueAtTime(0.0001, ctx.currentTime);
      ganho.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.01);
      ganho.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
      osc.connect(ganho);
      ganho.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
      window.setTimeout(() => void ctx.close(), 300);
    } catch {
      // O browser pode bloquear áudio; não interromper a aplicação.
    }
  }

  useEffect(() => {
    const canal = supabase
      .channel("notificacoes-" + userId)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notificacoes", filter: `user_id=eq.${userId}` },
        (payload) => {
          const nova = payload.new as Notificacao;
          qc.setQueryData<Notificacao[]>(["notificacoes", userId], (actual = []) => [nova, ...actual].slice(0, 20));
          tocarSom();
          if ("Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible") {
            new Notification("Embarque Inteligente", { body: nova.mensagem });
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notificacoes", filter: `user_id=eq.${userId}` },
        () => qc.invalidateQueries({ queryKey: ["notificacoes", userId] }),
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "notificacoes", filter: `user_id=eq.${userId}` },
        (payload) => {
          const removida = payload.old as { id?: string };
          if (removida?.id) {
            qc.setQueryData<Notificacao[]>(["notificacoes", userId], (actual = []) => actual.filter((n) => n.id !== removida.id));
          } else {
            qc.invalidateQueries({ queryKey: ["notificacoes", userId] });
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [userId, qc, somAtivo]);

  const notificacoes = data ?? [];
  const naoLidas = notificacoes.filter((n) => !n.lida).length;

  async function ativarSom() {
    try {
      const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        await ctx.resume();
        const osc = ctx.createOscillator();
        const ganho = ctx.createGain();
        ganho.gain.value = 0.0001;
        osc.connect(ganho);
        ganho.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.03);
        window.setTimeout(() => void ctx.close(), 100);
      }
    } catch {}
    localStorage.setItem("som_notificacoes", "1");
    setSomAtivo(true);
    if ("Notification" in window && Notification.permission === "default") {
      try { await Notification.requestPermission(); } catch {}
    }
    toast.success("Som das notificações activado");
  }

  function desativarSom() {
    localStorage.removeItem("som_notificacoes");
    setSomAtivo(false);
  }

  async function marcarComoLidas() {
    const ids = notificacoes.filter((n) => !n.lida).map((n) => n.id);
    if (!ids.length) return;
    const { error } = await supabase.from("notificacoes").update({ lida: true }).eq("user_id", userId).in("id", ids);
    if (error) { toast.error("Não foi possível marcar as notificações como lidas"); return; }
    qc.setQueryData<Notificacao[]>(["notificacoes", userId], (actual = []) => actual.map((n) => ids.includes(n.id) ? { ...n, lida: true } : n));
  }

  async function removerNotificacao(id: string) {
    const anterior = notificacoes;
    qc.setQueryData<Notificacao[]>(["notificacoes", userId], anterior.filter((n) => n.id !== id));
    const { error } = await supabase.from("notificacoes").delete().eq("id", id).eq("user_id", userId);
    if (error) {
      qc.setQueryData(["notificacoes", userId], anterior);
      toast.error("Não foi possível remover a notificação");
    }
  }

  async function limparLidas() {
    const lidas = notificacoes.filter((n) => n.lida);
    if (!lidas.length) return;
    const ids = lidas.map((n) => n.id);
    const anterior = notificacoes;
    qc.setQueryData<Notificacao[]>(["notificacoes", userId], notificacoes.filter((n) => !n.lida));
    const { error } = await supabase.from("notificacoes").delete().eq("user_id", userId).in("id", ids);
    if (error) {
      qc.setQueryData(["notificacoes", userId], anterior);
      toast.error("Não foi possível limpar as notificações lidas");
    }
  }

  return (
    <DropdownMenu open={aberto} onOpenChange={(v) => { setAberto(v); if (v) void marcarComoLidas(); }}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative min-h-11 min-w-11 text-sidebar-foreground hover:bg-sidebar-accent" aria-label="Notificações">
          <Bell className="h-5 w-5" />
          {naoLidas > 0 && <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">{naoLidas}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(92vw,24rem)] p-0">
        <div className="flex items-center justify-between px-3 py-2">
          <DropdownMenuLabel className="p-0">Notificações</DropdownMenuLabel>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-9" onClick={() => somAtivo ? desativarSom() : void ativarSom()} aria-label="Som das notificações">
              {somAtivo ? <Volume2 className="mr-1 h-4 w-4" /> : <VolumeX className="mr-1 h-4 w-4" />}
              <span className="hidden sm:inline">{somAtivo ? "Som activo" : "Activar som"}</span>
            </Button>
            <Button variant="ghost" size="sm" className="h-9" onClick={() => void limparLidas()}>Limpar lidas</Button>
          </div>
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-[min(70vh,32rem)] overflow-y-auto">
          {!notificacoes.length && <p className="px-3 py-6 text-center text-sm text-muted-foreground">Sem notificações.</p>}
          {notificacoes.slice(0, 10).map((n) => (
            <div
              key={n.id}
              className="group flex touch-pan-y items-start gap-2 border-b px-3 py-3 last:border-b-0"
              onTouchStart={(e) => { touchStartX.current = e.touches[0]?.clientX ?? null; }}
              onTouchEnd={(e) => {
                const start = touchStartX.current;
                const end = e.changedTouches[0]?.clientX ?? start ?? 0;
                touchStartX.current = null;
                if (start !== null && start - end > 60) void removerNotificacao(n.id);
              }}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm">{n.mensagem}</p>
                <p className="mt-1 text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString("pt-PT")}</p>
              </div>
              <Button variant="ghost" size="icon" aria-label="Remover notificação" className="h-9 w-9 shrink-0" onClick={() => void removerNotificacao(n.id)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
