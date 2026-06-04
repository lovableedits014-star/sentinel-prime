## Envios de cobrança — o que falta

Hoje o painel de Indicações só permite **cobrança 1 a 1** (botão verde do WhatsApp por linha). Falta o disparo em **massa** e o **automático**, usando a infraestrutura de WhatsApp que o cliente já tem (`whatsapp_instances`, `message_dispatches`, `whatsapp_dispatch_items`).

---

## Fase A — Disparo em massa manual (envio agora)

Botão novo no `IndicacoesPanel`: **"Enviar cobrança em massa"**.

1. Usa exatamente os filtros já visíveis (tipo / status / busca) para definir o público.
2. Modal mostra:
   - Quantos indicadores serão atingidos.
   - Quantos têm telefone (descarta sem telefone).
   - Quantos já têm token (gera token automaticamente para quem não tem).
   - Prévia da mensagem editável com placeholders `{primeiro_nome}`, `{faltam}`, `{meta}`, `{link}`, `{candidato}`.
   - Seleção da instância de WhatsApp (reaproveita `WhatsAppInstancePoolCard`).
3. Mensagens-modelo prontas por status:
   - **Zerados:** "Oi {primeiro_nome}, ainda não recebemos nenhuma indicação sua. Sua meta é {meta}. Use seu link: {link}"
   - **Abaixo da meta:** "Faltam {faltam} indicações para sua meta…"
   - **Meta cumprida:** mensagem de agradecimento + continue indicando.
4. Confirmação cria 1 `message_dispatches` + N `whatsapp_dispatch_items` e enfileira no mesmo pipeline que o resto do sistema já usa.

## Fase B — Cobrança automática agendada

Configurável em **Metas e configurações**:

- **Frequência:** desligada / semanal / a cada 3 dias / diária.
- **Dia e horário** do disparo (ex: terça às 10h).
- **Critério:** "só quem está abaixo da meta" + "só quem não recebeu cobrança nas últimas X horas".
- **Limite por disparo** (ex: máx 500/dia) para não estourar a instância.

Implementação: cron `pg_cron` chama uma rota pública `/api/public/hooks/eleicao-cobranca-auto` que monta o lote e enfileira no mesmo dispatch.

Tabelas extras:
- `eleicao_cobranca_config` (client_id, frequencia, hora, criterios, ultimo_disparo_em).
- Coluna `ultima_cobranca_em` em `v_eleicao_indicadores_cobranca` (vinda de `eleicao_notif_log` ou tabela própria) para evitar reenviar a mesma pessoa.

## Fase C — Acompanhamento e proteção

1. **Histórico de envios** dentro do painel: lista de disparos (data, total, sucesso, falhou, leu, clicou no link).
2. **Tracking de clique** opcional: gerar link curto `/i/{token}/{hash}` que registra abertura antes de redirecionar para `/indicar/{token}`.
3. **Não reenviar** para o mesmo indicador em menos de N horas (configurável; padrão 48h).
4. **Pausar automático** se a instância de WhatsApp cair / for desconectada.
5. **Botão "Testar comigo"** que envia para um número escolhido antes do disparo real.

## Fase D — Cobrança do candidato para o coordenador (cascata)

Hoje a régua só fala com quem tem token. Falta a camada de **pressão estruturada**:

- Quando um **coordenador** está abaixo da meta, alertar o admin no Dashboard ("3 coordenadores zerados").
- Disparo automático para o **coordenador** com resumo do time dele: "Seus 8 líderes trouxeram só 12 indicações. Cobra eles: {link_painel_do_lider_x}".
- Opcional: relatório semanal por e-mail/PDF para o candidato.

---

## Detalhes técnicos

**Banco**
- `eleicao_cobranca_config` (client_id PK, frequencia text, hora int, dias_semana int[], criterios jsonb, max_por_disparo int, ativo bool, ultimo_disparo_em timestamptz).
- `eleicao_cobranca_log` (id, client_id, indicador_id, dispatch_item_id, enviado_em, status, clicou_em, indicou_apos boolean).
- RPC `eleicao_montar_lote_cobranca(_client_id, _filtros jsonb, _limit int)` → retorna a lista com token garantido (gera se faltar) + mensagem renderizada.
- View `v_eleicao_indicadores_cobranca` ganha `ultima_cobranca_em` e `cobrancas_enviadas`.

**Frontend**
- `src/components/eleicao/IndicacoesPanel.tsx`: botão "Enviar em massa", modal de prévia, aba "Histórico de envios", aba "Cobrança automática" (dentro de Configurações).
- Reaproveita componentes de `Disparos` (seleção de instância, preview da mensagem, progresso) para manter UX consistente.

**Backend**
- Rota `src/routes/api/public/hooks/eleicao-cobranca-auto.ts` chamada por `pg_cron`.
- Server functions:
  - `eleicaoEnviarCobrancaMassa.functions.ts` (manual, autenticada).
  - `eleicaoCobrancaAutoRun.server.ts` (chamada pela rota pública com `apikey`).

---

## Ordem sugerida

1. **Fase A** (massa manual) — desbloqueia uso imediato.
2. **Fase C** (histórico + não-reenviar + teste) — controle antes de automatizar.
3. **Fase B** (agendamento automático).
4. **Fase D** (cascata candidato → coordenador → líder).

Antes de implementar, confirma 3 pontos:

1. Pode começar pela **Fase A inteira** (massa manual + prévia + escolha da instância)?
2. As mensagens-modelo (zerado / abaixo / ok) acima estão boas, ou você quer editar o texto antes?
3. Reaproveito a instância de WhatsApp que já está conectada no cliente, ou quer poder escolher uma instância específica só pra cobrança de eleição?
