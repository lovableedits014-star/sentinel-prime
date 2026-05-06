import { supabase } from "@/integrations/supabase/client-selfhosted";

/** Normaliza telefone só com dígitos. */
export function normPhone(p: string | null | undefined): string {
  return (p || "").replace(/\D/g, "");
}

/**
 * Busca um funcionário existente do client com o mesmo telefone (variações).
 * Retorna { id, nome } ou null.
 */
export async function findFuncionarioByPhone(
  clientId: string,
  telefone: string,
): Promise<{ id: string; nome: string } | null> {
  const digits = normPhone(telefone);
  if (digits.length < 8) return null;

  // Busca por correspondência exata ou variantes (com/sem 55, com/sem 9).
  const { data } = await supabase
    .from("funcionarios")
    .select("id, nome, telefone")
    .eq("client_id", clientId);
  if (!data) return null;

  for (const f of data as any[]) {
    const fd = normPhone(f.telefone);
    if (!fd) continue;
    if (fd === digits) return { id: f.id, nome: f.nome };
    // tenta variantes simples (últimos 10/11 dígitos)
    if (fd.slice(-10) === digits.slice(-10)) return { id: f.id, nome: f.nome };
  }
  return null;
}
