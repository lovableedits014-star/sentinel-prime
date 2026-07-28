## Onde está hoje

A funcionalidade **já está** dentro de **Central WhatsApp → aba "Missões IA" → sub-aba "Missões Ativas"**. O que não deu para ver de cara:

- O switch de rastreamento aparece **só no diálogo de EDITAR** missão (ícone de lápis no card).
- O botão de relatório 📊 só aparece **depois** que a missão foi salva com rastreamento ativado.
- Em **Disparos**, o botão **"Usar missões"** já injeta o link rastreado — mas isso é invisível se você não abrir uma missão com rastreamento ligado antes.

## O que ajustar (para tudo ficar visível e centralizado na Central WhatsApp)

### 1. Toggle de rastreamento no diálogo de CRIAR missão
Hoje o bloco "Ativar identificação e rastreamento" (switch + campos de link FB/IG/avulso + instruções) existe só no editar. Vou replicar o mesmo bloco no diálogo **"Adicionar missão"** para que já saia com rastreamento no ato da criação.

### 2. Sinalização visível no card da missão
No card de cada missão (na sub-aba "Missões Ativas"):
- Adicionar um **badge "Rastreada"** ao lado do nome quando `tracking_enabled = true`.
- Manter o ícone de **gráfico 📊** para abrir o relatório (já está implementado).
- Adicionar um **atalho "Ativar rastreamento"** direto no card quando estiver desligado, sem precisar abrir o diálogo inteiro de editar (só liga o toggle e abre um mini-form com os campos de link).

### 3. Aviso no disparo quando missão rastreada é usada
Em **Central WhatsApp → Disparos**, quando o usuário clicar **"Usar missões"** e houver ao menos uma missão com rastreamento ligado:
- Mostrar um pequeno banner informativo acima da caixa de mensagem: *"🎯 Rastreamento ativo — os cliques serão registrados por participante. Veja relatórios em Missões IA → Missões Ativas."*
- Deixar claro qual link foi substituído pelo link intermediário `/missao/<id>`.

### 4. Atribuição por grupo no disparo (fica claro qual grupo trouxe cada clique)
Quando `tipoDisparo === "grupos"` e a mensagem usar missões rastreadas:
- Antes de disparar, para cada par (missão × grupo selecionado), buscar/criar registro em `mission_distributions` com `short_code` (função `mission_generate_short_code()` já existe no banco).
- Substituir `/missao/<id>` no texto por `/api/public/m/<id>/d/<short_code>` (rota já existente que redireciona e atribui distribuição).
- Como o pipeline atual manda **uma** mensagem para todos os grupos, dividir o disparo em N chamadas — uma por grupo — com o texto customizado por grupo. Reusa o mesmo `send-whatsapp-dispatch`.
- Adicionar controle para: em modo grupo com rastreamento, o "Enviar teste" pré-visualiza a substituição do primeiro grupo selecionado.

### 5. Relatório com filtro por origem
No `MissionReport` (o 📊), garantir que:
- Aba/coluna **"Por grupo"** já lista cliques agrupados por `mission_distributions.group_jid` / label.
- Adicionar filtro rápido "Últimos 7 / 30 / todos" e export CSV.

## Fora do escopo

- Ranking de conversão entre missões (fica para próxima).
- Notificação push para participantes que não converteram.
- Mudança de qualquer lógica de anti-ban / cadência (já entregue).

## Detalhes técnicos

Arquivos que serão tocados:

- `src/components/engagement/PortalMissionsPanel.tsx` — replicar bloco de rastreamento no diálogo "Adicionar missão"; adicionar badge "Rastreada" e atalho de ativação no `MissionCard`.
- `src/pages/Disparos.tsx` — banner informativo quando `handleUseMissions` inserir link rastreado; no `handleSend`, se `tipoDisparo === "grupos"` e a mensagem contém `/missao/<id>`, dividir em N invocações do `send-whatsapp-dispatch` (uma por grupo) substituindo o link por `/api/public/m/<id>/d/<code>` após criar/localizar as distribuições.
- `src/components/engagement/MissionReport.tsx` — filtro de período e botão exportar CSV.
- Sem migration nova: `mission_distributions`, `mission_generate_short_code()`, e as rotas públicas já existem.

Sem impacto no fluxo atual de disparo para pessoas/eleição/funcionários — as mudanças só disparam quando `tipoDisparo === "grupos"` **e** houver missão rastreada na mensagem.