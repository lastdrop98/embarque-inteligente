import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Volume2, VolumeX, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  definirSom,
  mostrarAvisoSistema,
  pedirPermissaoAvisos,
  somActivo,
  tocarSomNotificacao,
} from "@/lib/somNotificacao";
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
  const [som, setSom] = useState(false);

  useEffect(() => {
    setSom(somActivo());
  }, []);

  const { data } = useQuery({
    queryKey: ["notificacoes", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notificacoes")
        .select("id, tipo, mensagem, lida, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data as Notificacao[];
    },
  });

  useEffect(() => {
    const canal = supabase
      .channel("notificacoes-" + userId)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notificacoes", filter: `user_id=eq.${userId}` },
        (payload) => {
          qc.invalidateQueries({ queryKey: ["notificacoes", userId] });
          if (payload.eventType === "INSERT") {
            const mensagem = (payload.new as { mensagem?: string }).mensagem ?? "Nova notificação";
            tocarSomNotificacao();
            mostrarAvisoSistema(mensagem);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [userId, qc]);

  const lista = data ?? [];
  const naoLidas = lista.filter((n) => !n.lida).length;

  async function marcarComoLidas() {
    const idsPorLer = lista.filter((n) => !n.lida).map((n) => n.id);
    if (!idsPorLer.length) return;
    await supabase.from("notificacoes").update({ lida: true }).in("id", idsPorLer).eq("user_id", userId);
    qc.invalidateQueries({ queryKey: ["notificacoes", userId] });
  }

  function removerLocalmente(ids: string[]) {
    qc.setQueryData<Notificacao[]>(["notificacoes", userId], (antigo) =>
      (antigo ?? []).filter((n) => !ids.includes(n.id)),
    );
  }

  async function removerNotificacao(id: string) {
    removerLocalmente([id]);
    const { error } = await supabase
      .from("notificacoes")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) {
      toast.error("Não foi possível remover a notificação.");
    }
    qc.invalidateQueries({ queryKey: ["notificacoes", userId] });
  }

  async function limparLidas() {
    const ids = lista.filter((n) => n.lida).map((n) => n.id);
    if (!ids.length) {
      toast.info("Não há notificações lidas para limpar.");
      return;
    }
    removerLocalmente(ids);
    const { error } = await supabase
      .from("notificacoes")
      .delete()
      .eq("user_id", userId)
      .eq("lida", true);
    if (error) toast.error("Não foi possível limpar as notificações lidas.");
    qc.invalidateQueries({ queryKey: ["notificacoes", userId] });
  }

  function alternarSom() {
    const novo = !som;
    setSom(novo);
    definirSom(novo);
    if (novo) {
      tocarSomNotificacao();
      void pedirPermissaoAvisos();
      toast.success("Som das notificações activado");
    } else {
      toast.info("Som das notificações desligado");
    }
  }

  return (
    <DropdownMenu
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (v) marcarComoLidas();
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Notificações"
          className="relative h-10 w-10 text-sidebar-foreground hover:bg-sidebar-accent"
        >
          <Bell className="h-5 w-5" />
          {naoLidas > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {naoLidas}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-[min(22rem,calc(100vw-1.5rem))] p-0"
      >
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <span className="text-sm font-semibold">Notificações</span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={som ? "Desligar som das notificações" : "Activar som das notificações"}
              title={som ? "Desligar som" : "Activar som das notificações"}
              onClick={alternarSom}
            >
              {som ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4 text-muted-foreground" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Limpar notificações lidas"
              title="Limpar lidas"
              onClick={limparLidas}
            >
              <CheckCheck className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {!lista.length && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Sem notificações.</p>
          )}
          {lista.map((n) => (
            <LinhaNotificacao key={n.id} notificacao={n} onRemover={() => removerNotificacao(n.id)} />
          ))}
        </div>

        {!som && (
          <p className="border-t px-3 py-2 text-[11px] leading-snug text-muted-foreground">
            Active o som para ouvir um aviso quando chegar uma notificação nova.
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LinhaNotificacao({
  notificacao,
  onRemover,
}: {
  notificacao: Notificacao;
  onRemover: () => void;
}) {
  const [desvio, setDesvio] = useState(0);
  const inicio = useRef<number | null>(null);

  return (
    <div className="relative overflow-hidden border-b last:border-b-0">
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center bg-destructive px-4 text-xs font-medium text-destructive-foreground">
        Remover
      </div>
      <div
        className="relative flex items-start justify-between gap-2 bg-popover px-3 py-2.5 transition-transform"
        style={{ transform: `translateX(${desvio}px)` }}
        onTouchStart={(e) => {
          inicio.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchMove={(e) => {
          if (inicio.current === null) return;
          const delta = (e.touches[0]?.clientX ?? 0) - inicio.current;
          setDesvio(Math.min(0, Math.max(-140, delta)));
        }}
        onTouchEnd={() => {
          if (desvio < -90) {
            setDesvio(-400);
            onRemover();
          } else {
            setDesvio(0);
          }
          inicio.current = null;
        }}
      >
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className={`text-sm ${notificacao.lida ? "" : "font-medium"}`}>{notificacao.mensagem}</span>
          <span className="text-xs text-muted-foreground">
            {new Date(notificacao.created_at).toLocaleString("pt-PT")}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Remover notificação"
          className="h-8 w-8 shrink-0 text-muted-foreground"
          onClick={(e) => {
            e.stopPropagation();
            onRemover();
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
