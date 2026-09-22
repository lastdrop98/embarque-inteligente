import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

  const { data } = useQuery({
    queryKey: ["notificacoes", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notificacoes")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
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
        () => qc.invalidateQueries({ queryKey: ["notificacoes", userId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [userId, qc]);

  const naoLidas = (data ?? []).filter((n) => !n.lida).length;

  async function marcarComoLidas() {
    const idsPorLer = (data ?? []).filter((n) => !n.lida).map((n) => n.id);
    if (!idsPorLer.length) return;
    await supabase.from("notificacoes").update({ lida: true }).in("id", idsPorLer);
    qc.invalidateQueries({ queryKey: ["notificacoes", userId] });
  }

  async function removerNotificacao(id: string) {
    const { error } = await supabase
      .from("notificacoes")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) {
      console.error(error);
      return;
    }
    qc.invalidateQueries({ queryKey: ["notificacoes", userId] });
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
        <Button variant="ghost" size="icon" className="relative text-sidebar-foreground hover:bg-sidebar-accent">
          <Bell className="h-4 w-4" />
          {naoLidas > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {naoLidas}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notificações</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {!data?.length && <p className="px-2 py-4 text-center text-sm text-muted-foreground">Sem notificações.</p>}
        {data?.slice(0, 10).map((n) => (
          <DropdownMenuItem
            key={n.id}
            onSelect={(e) => e.preventDefault()}
            className="flex items-start justify-between gap-2 whitespace-normal"
          >
            <span className="flex flex-col items-start gap-0.5">
              <span className="text-sm">{n.mensagem}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(n.created_at).toLocaleString("pt-PT")}
              </span>
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Remover notificação"
              className="h-6 w-6 shrink-0 text-muted-foreground"
              onClick={(e) => {
                e.stopPropagation();
                removerNotificacao(n.id);
              }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
