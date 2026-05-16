// Shared input-validation helper for edge functions — Onda 3.
//
// Modo "warn-only" por padrão: a validação NÃO bloqueia o request, apenas
// loga `console.warn` com o nome da função e os erros do Zod. Isto permite
// adotar Zod gradualmente em funções já em produção sem risco de quebrar
// integrações. Após 48h sem warns no logs, troque `mode` para "enforce"
// para começar a devolver 400.
//
// Uso típico:
//   import { validateInput } from "../_shared/validate.ts";
//   const body = await req.json();
//   const parsed = validateInput(MySchema, body, { fn: "create-team-user" });
//   // Em warn-only: parsed.data === body (passa adiante mesmo se inválido);
//   // Em enforce:   se inválido, parsed.response é uma Response 400 pronta.

import { z } from "https://esm.sh/zod@3.23.8";

type Mode = "warn" | "enforce";

const DEFAULT_MODE: Mode =
  (Deno.env.get("EDGE_VALIDATION_MODE") as Mode) || "warn";

const corsJsonHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-token",
  "Content-Type": "application/json",
};

export type ValidateResult<T> =
  | { ok: true; data: T; warnOnly: false }
  | { ok: true; data: unknown; warnOnly: true; warnings: string[] }
  | { ok: false; response: Response };

export function validateInput<T>(
  schema: z.ZodType<T>,
  data: unknown,
  opts: { fn: string; mode?: Mode },
): ValidateResult<T> {
  const mode = opts.mode ?? DEFAULT_MODE;
  const result = schema.safeParse(data);

  if (result.success) {
    return { ok: true, data: result.data, warnOnly: false };
  }

  const warnings = result.error.errors.map(
    (e) => `${e.path.join(".") || "(root)"}: ${e.message}`,
  );

  // Sempre loga, qualquer que seja o modo. Logs são monitorados para
  // decidir quando promover de warn para enforce.
  console.warn(
    `[edge-validate][${opts.fn}] schema mismatch (mode=${mode}):`,
    JSON.stringify(warnings),
  );

  if (mode === "warn") {
    return { ok: true, data, warnOnly: true, warnings };
  }

  return {
    ok: false,
    response: new Response(
      JSON.stringify({ error: "Dados inválidos" }),
      { status: 400, headers: corsJsonHeaders },
    ),
  };
}

export { z };
