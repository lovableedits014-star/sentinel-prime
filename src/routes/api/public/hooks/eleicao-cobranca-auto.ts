import { createFileRoute } from "@tanstack/react-router";

// Cron-acionado de hora em hora. Para cada client com config ativa,
// verifica se está na janela do horário/dia configurado e dispara
// uma cobrança usando a edge function `send-whatsapp-dispatch`.
//
// Idempotência: marca ultimo_disparo_em logo após disparar e usa
// proximo_disparo_em para evitar repetir no mesmo slot.

const SAO_PAULO_OFFSET_HOURS = -3;

function nowInSaoPaulo(): Date {
  const d = new Date();
  return new Date(d.getTime() + SAO_PAULO_OFFSET_HOURS * 3600 * 1000);
}

function todayKey(d: Date): string {
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}

export const Route = createFileRoute("/api/public/hooks/eleicao-cobranca-auto")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: configs, error } = await supabaseAdmin
          .from("eleicao_cobranca_auto_config")
          .select("*")
          .eq("ativo", true);
        if (error) {
          console.error("[cobranca-auto] erro lendo configs:", error);
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        const spNow = nowInSaoPaulo();
        const minutosAgora = spNow.getUTCHours() * 60 + spNow.getUTCMinutes();
        // ISO-ish weekday: 1=segunda ... 7=domingo
        const jsDow = spNow.getUTCDay(); // 0=domingo .. 6=sábado
        const dowIso = jsDow === 0 ? 7 : jsDow;

        const results: any[] = [];

        for (const cfg of (configs || []) as any[]) {
          try {
            // Janela do dia certo?
            if (cfg.frequencia === "semanal") {
              const dias: number[] = cfg.dias_semana || [];
              if (!dias.includes(dowIso)) {
                results.push({ client_id: cfg.client_id, skipped: "fora_do_dia" });
                continue;
              }
            }

            // Horário (precisa estar entre hora_envio e hora_envio + 60min)
            const [hh, mm] = String(cfg.hora_envio || "10:00:00").split(":").map(Number);
            const minutosAlvo = (hh || 0) * 60 + (mm || 0);
            if (minutosAgora < minutosAlvo || minutosAgora >= minutosAlvo + 60) {
              results.push({ client_id: cfg.client_id, skipped: "fora_da_hora", agora: minutosAgora, alvo: minutosAlvo });
              continue;
            }

            // Já disparou hoje?
            if (cfg.ultimo_disparo_em) {
              const ultSp = new Date(new Date(cfg.ultimo_disparo_em).getTime() + SAO_PAULO_OFFSET_HOURS * 3600 * 1000);
              if (todayKey(ultSp) === todayKey(spNow)) {
                results.push({ client_id: cfg.client_id, skipped: "ja_disparou_hoje" });
                continue;
              }
            }

            // Origin (links): pega de env ou usa do request? Aqui usamos PUBLISHED URL.
            const origin = process.env.APP_PUBLISHED_URL
              || "https://project--f504a57a-e9eb-4ac5-96f4-43d71314fbc0.lovable.app";

            // Busca nome do candidato (client.name)
            const { data: cli } = await supabaseAdmin
              .from("clients").select("name").eq("id", cfg.client_id).maybeSingle();

            // Dispara via edge function
            const fnUrl = `${process.env.SUPABASE_URL}/functions/v1/send-whatsapp-dispatch`;
            const res = await fetch(fnUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
                "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY || "",
              },
              body: JSON.stringify({
                client_id: cfg.client_id,
                titulo: `🤖 Cobrança automática — ${new Date().toLocaleDateString("pt-BR")}`,
                mensagem: cfg.mensagem_template,
                tipo: "indicadores_cobranca",
                cobranca_filtros: {
                  tipo: cfg.filtro_tipo || undefined,
                  status: cfg.filtro_status || "abaixo",
                },
                cobranca_candidato: cli?.name || "",
                cobranca_origin: origin,
                cobranca_janela_horas: cfg.janela_horas || 48,
                batch_size: 10, delay_min: 5, delay_max: 15, batch_pause: 60,
              }),
            });
            const body = await res.json().catch(() => ({}));

            const resumoMsg = res.ok
              ? `✅ ${body?.queued ? "Enfileirado" : `Disparado p/ ${body?.total_recipients ?? "?"}`} em ${new Date().toLocaleString("pt-BR")}`
              : `❌ ${res.status} ${body?.error || ""}`;

            await supabaseAdmin
              .from("eleicao_cobranca_auto_config")
              .update({
                ultimo_disparo_em: new Date().toISOString(),
                ultimo_resultado: resumoMsg.slice(0, 500),
              })
              .eq("id", cfg.id);

            results.push({ client_id: cfg.client_id, ok: res.ok, body });
          } catch (e: any) {
            console.error("[cobranca-auto] falhou client", cfg.client_id, e);
            await supabaseAdmin
              .from("eleicao_cobranca_auto_config")
              .update({ ultimo_resultado: `❌ ${e?.message || "erro"}`.slice(0, 500) })
              .eq("id", cfg.id);
            results.push({ client_id: cfg.client_id, error: e?.message });
          }
        }

        return Response.json({ ok: true, processed: results.length, results });
      },
    },
  },
});
