import { createFileRoute } from "@tanstack/react-router";

const json = (body: unknown, status = 200) => Response.json(body, { status });

const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");

export const Route = createFileRoute("/api/telemarketing/purge-test-operator")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authorization = request.headers.get("authorization") || "";
          const token = authorization.replace(/^Bearer\s+/i, "");
          if (!token) return json({ error: "Não autenticado" }, 401);

          const body = await request.json().catch(() => ({}));
          const clientId = String(body.clientId || "");
          const operatorId = String(body.operatorId || "");
          if (!clientId || !operatorId) return json({ error: "Dados incompletos" }, 400);

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
          const userId = authData?.user?.id;
          if (authError || !userId) return json({ error: "Sessão inválida" }, 401);

          const [{ data: owned }, { data: member }, { data: platformUser }] = await Promise.all([
            supabaseAdmin
              .from("clients")
              .select("id")
              .eq("id", clientId)
              .eq("user_id", userId)
              .maybeSingle(),
            supabaseAdmin
              .from("team_members")
              .select("id")
              .eq("client_id", clientId)
              .eq("user_id", userId)
              .maybeSingle(),
            supabaseAdmin
              .from("platform_users")
              .select("id")
              .eq("user_id", userId)
              .eq("status", "active")
              .maybeSingle(),
          ]);
          if (!owned && !member && !platformUser)
            return json({ error: "Sem permissão para este cliente" }, 403);

          const { data: operator, error: operatorError } = await supabaseAdmin
            .from("telemarketing_operadores")
            .select("id, nome")
            .eq("id", operatorId)
            .eq("client_id", clientId)
            .maybeSingle();
          if (operatorError) throw operatorError;
          if (!operator) return json({ error: "Operador não encontrado" }, 404);

          const normalizedName = operator.nome.trim().toLocaleLowerCase("pt-BR");
          if (!["operador1", "teste admin"].includes(normalizedName)) {
            return json(
              { error: "A limpeza completa está restrita aos dois operadores de teste" },
              400,
            );
          }
          const operatorPattern = escapeLike(operator.nome.trim());

          const ensure = (error: { message: string } | null, step: string) => {
            if (error) throw new Error(`${step}: ${error.message}`);
          };

          let response = await supabaseAdmin
            .from("telemarketing_call_log")
            .delete()
            .eq("client_id", clientId)
            .ilike("operador_nome", operatorPattern);
          ensure(response.error, "histórico de ligações");

          response = await supabaseAdmin
            .from("telemarketing_call_assignments")
            .delete()
            .eq("client_id", clientId)
            .ilike("operador_nome", operatorPattern);
          ensure(response.error, "travas de atendimento");

          response = await supabaseAdmin
            .from("telemarketing_operador_audit")
            .delete()
            .eq("client_id", clientId)
            .ilike("operador_nome", operatorPattern);
          ensure(response.error, "auditoria do operador");

          response = await supabaseAdmin
            .from("telemarketing_assignment_log")
            .delete()
            .eq("client_id", clientId)
            .eq("operador_id", operatorId);
          ensure(response.error, "histórico de distribuição");

          const regularReset = {
            ligacao_status: "pendente",
            operador_nome: null,
            ligacao_em: null,
            tentativas_count: 0,
            proxima_tentativa_em: null,
            observacao_tele: null,
            vota_candidato: null,
            candidato_alternativo: null,
            candidato_federal: null,
            federal_status: null,
            candidato_senador: null,
            senador_status: null,
            candidato_governador: null,
            governador_status: null,
          };

          for (const table of [
            "contratados",
            "telemarketing_contatos_avulsos",
            "eleicao_pessoas",
          ] as const) {
            response = await supabaseAdmin
              .from(table)
              .update(regularReset)
              .eq("client_id", clientId)
              .ilike("operador_nome", operatorPattern);
            ensure(response.error, `limpeza em ${table}`);
          }

          response = await supabaseAdmin
            .from("contratado_indicados")
            .update({ ...regularReset, status: "pendente" })
            .eq("client_id", clientId)
            .ilike("operador_nome", operatorPattern);
          ensure(response.error, "limpeza em contratado_indicados");

          response = await supabaseAdmin
            .from("eleicao_indicados")
            .update({
              status_telemarketing: "pendente",
              ultimo_status_ligacao: "pendente",
              operador_nome: null,
              ultima_ligacao_em: null,
              total_tentativas: 0,
              proxima_tentativa_em: null,
              observacao_tele: null,
              vota_candidato: null,
              candidato_alternativo: null,
              candidato_federal: null,
              federal_status: null,
              candidato_senador: null,
              senador_status: null,
              candidato_governador: null,
              governador_status: null,
            })
            .eq("client_id", clientId)
            .ilike("operador_nome", operatorPattern);
          ensure(response.error, "limpeza em eleicao_indicados");

          response = await supabaseAdmin
            .from("telemarketing_operadores")
            .delete()
            .eq("id", operatorId)
            .eq("client_id", clientId);
          ensure(response.error, "exclusão do operador");

          return json({ ok: true, operator: operator.nome });
        } catch (error) {
          console.error("[purge-test-operator]", error);
          return json(
            { error: error instanceof Error ? error.message : "Erro ao excluir operador" },
            500,
          );
        }
      },
    },
  },
});
