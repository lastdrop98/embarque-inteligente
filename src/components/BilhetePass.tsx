import { useEffect, useState } from "react";
import { Check, Copy, QrCode } from "lucide-react";
import QRCode from "qrcode";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export type DadosBilhete = {
  token: string;
  passageiro: string;
  rota: string;
  veiculo?: string | null;
  paragemEmbarque?: string | null;
  horaEmbarque?: string | null;
  paragemDesembarque?: string | null;
  estado: "pendente" | "a_bordo" | "concluida" | "recusada" | string;
  emitidoEm?: string | null;
};

const ESTADO_INFO: Record<string, { rotulo: string; cor: string }> = {
  pendente: { rotulo: "Pendente", cor: "bg-amber-500 text-white" },
  a_bordo: { rotulo: "A bordo", cor: "bg-emerald-600 text-white" },
  concluida: { rotulo: "Concluída", cor: "bg-emerald-600 text-white" },
  recusada: { rotulo: "Inválido", cor: "bg-destructive text-destructive-foreground" },
};

export function BilhetePass({ dados, compacto = false }: { dados: DadosBilhete; compacto?: boolean }) {
  const [qr, setQr] = useState("");
  const [copiado, setCopiado] = useState(false);
  const info = ESTADO_INFO[dados.estado] ?? { rotulo: dados.estado, cor: "bg-secondary" };

  useEffect(() => {
    QRCode.toDataURL(dados.token, { width: 480, margin: 1, color: { dark: "#1b2540", light: "#ffffff" } }).then(setQr);
  }, [dados.token]);

  return (
    <Card className="overflow-hidden" style={{ boxShadow: "var(--shadow-panel)" }}>
      <div className={`px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide ${info.cor}`}>
        {info.rotulo}
      </div>
      <CardHeader className="text-center pb-2">
        <p className="text-lg font-bold">{dados.passageiro}</p>
        <p className="text-sm text-muted-foreground">{dados.rota}</p>
      </CardHeader>
      <CardContent className="space-y-4 text-center">
        {!compacto && qr && (
          <img src={qr} alt="QR Code de embarque" className="mx-auto w-full max-w-[240px] rounded-lg border" />
        )}
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-dashed p-3 text-left text-sm">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Embarque</p>
            <p className="font-medium">{dados.paragemEmbarque ?? "—"}</p>
            {dados.horaEmbarque && <p className="text-xs text-muted-foreground">{dados.horaEmbarque.slice(0, 5)}</p>}
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Desembarque</p>
            <p className="font-medium">{dados.paragemDesembarque ?? "—"}</p>
          </div>
          {dados.emitidoEm && (
            <div className="col-span-2 border-t pt-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Bilhete emitido em</p>
              <p className="font-medium">{new Date(dados.emitidoEm).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })}</p>
            </div>
          )}
          {dados.veiculo && (
            <div className="col-span-2 border-t pt-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Veículo</p>
              <p className="font-medium">{dados.veiculo}</p>
            </div>
          )}
        </div>
                <div className="mx-auto max-w-xs rounded-2xl border bg-muted/40 p-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Código alternativo</p>
          <div className="mt-1 flex items-center justify-center gap-2">
            <span className="font-mono text-xl font-bold tracking-[0.18em] text-foreground">{dados.token}</span>
            <button
              type="button"
              aria-label="Copiar código alternativo"
              title="Copiar código"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border bg-background transition-all hover:-translate-y-0.5 hover:bg-accent active:scale-95"
              onClick={() => void copiarCodigo()}
            >
              {copiado ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">Use este código apenas se não puder fazer a leitura do QR.</p>
        </div>
      </CardContent>
    </Card>
  );
}
