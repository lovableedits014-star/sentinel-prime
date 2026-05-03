import { Loader2, CheckCircle2, XCircle, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CpfCheckResult } from "@/hooks/use-cpf-check";

const WHERE_LABEL: Record<string, string> = {
  pessoas: "Base de Pessoas",
  funcionarios: "Funcionários",
  contratados: "Contratados",
  apoiadores: "Apoiadores",
};

export function CpfStatusIndicator({ result }: { result: CpfCheckResult }) {
  if (result.status === "idle") return null;

  const base = "mt-2 flex items-start gap-2 rounded-md border px-3 py-2 text-xs transition-colors";

  if (result.status === "checking") {
    return (
      <div className={cn(base, "border-muted-foreground/20 bg-muted/40 text-muted-foreground")}> 
        <Loader2 className="w-3.5 h-3.5 mt-0.5 animate-spin shrink-0" />
        <span className="font-medium">Procurando cadastro duplicado…</span>
      </div>
    );
  }

  if (result.status === "ok") {
    return (
      <div className={cn(base, "border-emerald-500/40 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300")}> 
        <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span className="font-medium">CPF disponível — pode prosseguir.</span>
      </div>
    );
  }

  if (result.status === "duplicate") {
    const label = result.where ? WHERE_LABEL[result.where] || result.where : null;
    return (
      <div className={cn(base, "border-destructive/50 bg-destructive/10 text-destructive")}> 
        <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <div className="space-y-0.5">
          <p className="font-semibold">Este CPF já está cadastrado no sistema.</p>
          {label && (
            <p className="text-[11px] opacity-90">Encontrado em: <strong>{label}</strong></p>
          )}
          <p className="text-[11px] opacity-90">Não é possível cadastrar a mesma pessoa duas vezes.</p>
        </div>
      </div>
    );
  }

  // invalid
  return (
    <div className={cn(base, "border-destructive/50 bg-destructive/10 text-destructive")}> 
      <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      <span className="font-medium">{result.message}</span>
    </div>
  );
}