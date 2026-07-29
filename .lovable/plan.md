
# Plano — Telemarketing: listas, designação e WhatsApp

Objetivo: deixar a criação de fila com upload real de Excel, dividir contatos por operador sem repetição, permitir redistribuir quando alguém sai, e trocar o botão de ligar para abrir conversa no WhatsApp.

O que já existe hoje (aproveitar):
- `ImportContatosAvulsosDialog.tsx` já lê `.xlsx/.xls/.csv` com mapeamento de colunas.
- Coluna `telemarketing_contatos_avulsos.assigned_operador_id` e RPCs `tele_assign_contatos`, `tele_distribute_contatos` (round-robin), `tele_release_contatos`, `tele_admin_listar_avulsos`.
- Fila de admin em `TelemarketingAdminFilas.tsx` e portal do operador em `Telemarketing.tsx`.

---

## 1. Upload de Excel no fluxo da fila (fim da confusão)

- No `NovaFilaWizard`, na origem **CSV / colar lista**, renomear para **"Lista externa (Excel/CSV)"** e substituir o `<Textarea>` por um uploader idêntico ao `ImportContatosAvulsosDialog` (arraste ou clique, aceita `.xlsx/.xls/.csv`, mapeamento de colunas Nome/Telefone/Cidade/Bairro, contagem de válidos/inválidos). Manter "colar texto" como *fallback* recolhível ("Prefiro colar").
- Adicionar no passo 3 um seletor opcional **"Designar contatos a…"** com três modos:
  - *Pool livre* (todos os operadores da fila podem pegar) — comportamento atual.
  - *Um operador específico* (dropdown).
  - *Dividir igualmente entre operadores selecionados* (multi-check) — usa `tele_distribute_contatos` após criar a fila.
- Na tela de filas (`TelemarketingAdminFilas.tsx`), em cada card mostrar contagem por operador (ex: "Ana 120 · Bruno 118 · Livre 30") e botão **"Gerenciar designações"** que abre o `AtribuicoesDialog` já pronto.

## 2. Anti-duplicidade e divisão justa

- **Deduplicar na importação**: no `tele_import_contato_avulso_batch`, antes de inserir, comparar `telefone` normalizado (só dígitos, com DDI 55) contra:
  1. contatos já existentes na mesma campanha → ignorar,
  2. contatos existentes em outras campanhas do mesmo cliente → retornar contador "já existe em outra fila" e permitir importar mesmo assim (checkbox "Ignorar duplicados globais", padrão ligado).
- Retornar `{inserted, skipped_same_campaign, skipped_other_campaign}` e mostrar no toast.
- **Trava por operador**: quando `assigned_operador_id` está preenchido, o `tele_proximo_contato` já filtra; garantir que a trava de 5 min (`telemarketing_call_assignments`) mais o `assigned_operador_id` impedem duas pessoas de pegar o mesmo registro. Adicionar índice `(client_id, campanha_id, assigned_operador_id, ligacao_status)` para performance.
- **Divisão justa**: criar RPC `tele_redistribute_campanha(_campanha_id, _operador_ids[], _only_pending bool)` que:
  1. libera (`assigned_operador_id = NULL`) os pendentes dos operadores atuais fora da lista nova,
  2. redistribui pendentes em round-robin entre os operadores da lista,
  3. preserva contatos já ligados (não mexe em quem `ligacao_status IS NOT NULL`).
- **Saída de operador**: no `TelemarketingAdminOperadores`, ao **desativar** ou **remover** um operador, disparar um diálogo "Este operador tinha X contatos pendentes. Redistribuir entre: [checkboxes de operadores ativos]" chamando o RPC acima. Sem redistribuição, os contatos voltam ao pool livre automaticamente.

## 3. Ligação via WhatsApp

- No portal do operador (`Telemarketing.tsx`), o bloco atual `<a href="tel:...">` vira dois botões lado a lado:
  - **Abrir WhatsApp** (padrão, verde) → `https://wa.me/<E.164 sem +>?text=<template opcional da campanha>`. Usa `normalizeBRPhone` de `src/lib/phone-utils.ts` (já existe).
  - **Ligar (telefone)** (secundário) → mantém `tel:` para quem prefere.
- Nas campanhas, adicionar campo `whatsapp_template` (texto opcional com placeholders `{{nome}}`, `{{operador}}`) usado como mensagem inicial pré-preenchida. Guardar em `telemarketing_campanhas.whatsapp_template TEXT NULL` e expor no wizard passo 4 (junto com o script).
- Ao clicar em "Abrir WhatsApp", já registrar automaticamente um `heartbeat` (contato em atendimento) — sem gravar resultado. O operador ainda precisa marcar Atendeu/Não atendeu/Recusou/Reagendar.

## 4. Detalhes técnicos

```text
Migração SQL
├── ALTER telemarketing_campanhas ADD COLUMN whatsapp_template TEXT
├── CREATE INDEX idx_tele_avulsos_assigned ON telemarketing_contatos_avulsos
│     (client_id, campanha_id, assigned_operador_id, ligacao_status)
├── REPLACE FUNCTION tele_import_contato_avulso_batch (retornar skipped counts + dedup)
└── CREATE FUNCTION tele_redistribute_campanha(_campanha, _op_ids[], _only_pending)

Frontend
├── NovaFilaWizard.tsx        → uploader Excel + designação inicial
├── TelemarketingAdminFilas   → contagem por operador + botão "Gerenciar designações"
├── AtribuicoesDialog         → botão "Redistribuir" chamando novo RPC
├── TelemarketingAdminOperadores → prompt de redistribuição ao desativar/remover
└── Telemarketing.tsx         → botão WhatsApp (wa.me) com template resolvido
```

## Riscos e mitigação

- **Excel com telefone como número** (ex: `6.7999e10`): já tratado pelo `raw:false` no `xlsx.sheet_to_json` + `onlyDigits`; garantir teste com célula numérica.
- **wa.me exige número sem `+` e com DDI**: usar `normalizeBRPhone` (já retorna `5567…`).
- **Redistribuição durante ligação em andamento**: só mexer em contatos sem `locked_until` futuro; contatos travados são pulados e reprocessados no próximo ciclo.
- **Dedup entre campanhas**: usuário pode querer o mesmo contato em duas filas (ex: 1ª e 2ª rodada); por isso o skip global vira opção, não obrigação.
- **Volume alto de contatos numa distribuição**: o RPC roda em lote com `UPDATE … FROM (SELECT … row_number() % N)`, sem loop app-side.

## Fora deste plano

- Discador automático / integração com PABX.
- Templates de WhatsApp com mídia (só texto agora).
- Relatório de reciprocidade das mensagens de WhatsApp (isso vive no módulo de disparos).
