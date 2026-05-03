import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { cpfDigits, isValidCpf } from "@/lib/cpf-mask";

export type CpfCheckStatus = "idle" | "checking" | "ok" | "duplicate" | "invalid";

export interface CpfCheckResult {
  status: CpfCheckStatus;
  message: string;
  where?: string | null;
}

/**
 * Verifica em tempo real se o CPF já está cadastrado para o cliente.
 * Dispara a verificação 500ms após o usuário terminar de digitar 11 dígitos.
 */
export function useCpfCheck(cpf: string, clientId: string | undefined): CpfCheckResult {
  const [result, setResult] = useState<CpfCheckResult>({ status: "idle", message: "" });

  useEffect(() => {
    const digits = cpfDigits(cpf);

    if (digits.length === 0) {
      setResult({ status: "idle", message: "" });
      return;
    }
    if (digits.length < 11) {
      setResult({ status: "idle", message: "" });
      return;
    }
    if (!isValidCpf(cpf)) {
      setResult({ status: "invalid", message: "CPF inválido. Confira os dígitos." });
      return;
    }
    if (!clientId) return;

    setResult({ status: "checking", message: "Verificando CPF..." });
    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        const { data, error } = await supabase.functions.invoke("check-cpf-exists", {
          body: { client_id: clientId, cpf: digits },
        });
        if (cancelled) return;
        if (error) {
          setResult({ status: "idle", message: "" });
          return;
        }
        if (data?.exists) {
          setResult({
            status: "duplicate",
            message: "Este CPF já está cadastrado no sistema.",
            where: data.where,
          });
        } else if (data?.valid) {
          setResult({ status: "ok", message: "CPF disponível." });
        } else {
          setResult({ status: "invalid", message: "CPF inválido." });
        }
      } catch {
        if (!cancelled) setResult({ status: "idle", message: "" });
      }
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cpf, clientId]);

  return result;
}