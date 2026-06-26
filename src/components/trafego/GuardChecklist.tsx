import { CheckCircle2, XCircle, AlertTriangle, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export type GuardCheck = {
  code: string;
  label: string;
  status: "ok" | "warning" | "blocked";
  severity: "block" | "warn" | "info";
  message: string;
  fix?: string;
};

export function GuardChecklist({ checks }: { checks: GuardCheck[] }) {
  if (!checks || checks.length === 0) return null;
  const blocking = checks.filter(c => c.status === "blocked").length;
  const warning = checks.filter(c => c.status === "warning").length;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <ShieldCheck className="h-4 w-4" />
        Guard Eleitoral · {checks.length} checks · {blocking > 0 ? `${blocking} bloqueios` : warning > 0 ? `${warning} alertas` : "tudo ok"}
      </div>
      {checks.map((c) => (
        <Alert key={c.code} className={
          c.status === "blocked" ? "border-red-500 bg-red-50 dark:bg-red-950/30"
          : c.status === "warning" ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30"
          : "border-green-500 bg-green-50 dark:bg-green-950/30"
        }>
          {c.status === "blocked" ? <XCircle className="h-4 w-4 text-red-600" />
            : c.status === "warning" ? <AlertTriangle className="h-4 w-4 text-amber-600" />
            : <CheckCircle2 className="h-4 w-4 text-green-600" />}
          <AlertTitle className="text-sm">{c.label}</AlertTitle>
          <AlertDescription className="text-xs space-y-1">
            <p>{c.message}</p>
            {c.fix && <p className="text-muted-foreground"><strong>Como resolver:</strong> {c.fix}</p>}
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
