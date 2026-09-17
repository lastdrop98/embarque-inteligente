import { useEffect, useState } from "react";
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
};

const ESTADO_INFO: Record<string, { rotulo: string; cor: string }> = {
  pendente: { rotulo: "Pendente", cor: "bg-amber-500 text-white" },
  a_bordo: { rotulo: "A bordo", cor: "bg-emerald-600 text-white" },
  concluida: { rotulo: "Concluída", cor: "bg-emerald-600 text-white" },
  recusada: { rotulo: "Inválido", cor: "bg-destructive text-destructive-foreground" },
};

export function BilhetePass({ dados, compacto = false }: { dados: DadosBilhete; compacto?: boolean }) {
  const [qr, setQr] = useState("");
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
          {dados.veiculo && (
            <div className="col-span-2 border-t pt-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Veículo</p>
              <p className="font-medium">{dados.veiculo}</p>
            </div>
          )}
        </div>
        <p className="font-mono text-[10px] text-muted-foreground">{dados.token}</p>
      </CardContent>
    </Card>
  );
}
