# Pendentes de valor: filtro por região + etiqueta "Voluntário"

## Objetivo

Na aba **Pendentes de valor** (Eleição), poder filtrar por **região/cidade** para lançar os valores de contrato de forma organizada, e marcar pessoas como **Voluntárias** (trabalham sem custo) para que saiam da fila de pendências e não entrem na previsão de custos.

## O que muda para você

1. **Filtro por região/cidade**
   - Novo seletor "Região / cidade" ao lado do filtro de tipo, montado com as regiões de Campo Grande e as cidades do interior que realmente têm pendências (com a contagem de pendentes ao lado de cada uma).
   - Opção "Sem região definida" para achar cadastros incompletos.
   - Contadores de coordenador / líder / cabo passam a refletir o filtro aplicado, e "Selecionar todos" seleciona apenas o que está filtrado — então você resolve uma região por vez e aplica o valor em massa com segurança.

2. **Etiqueta "Voluntário"**
   - Botão **"Voluntário"** em cada linha e também na barra de ações em massa ("Marcar como voluntários").
   - Ao marcar: a pessoa recebe selo verde **Voluntário**, sai da lista de pendentes de valor (custo zero, nada mais a lançar) e o motivo pode ser anotado.
   - Sub-aba/alternador **"Pendentes | Voluntários"** dentro do painel, para você revisar quem está como voluntário e **desmarcar** (volta para pendentes) quando alguém passar a ser remunerado.
   - Voluntários não geram contrato de valor, e a **Previsão de custos** passa a contá-los como R$ 0 com uma linha "X voluntários (sem custo)".

3. **Resumo por região**
   - No topo do painel, um resumo compacto: por região, quantos pendentes, quantos voluntários e quanto já foi lançado — para bater o total antes de fechar os contratos.

## Detalhes técnicos

### Banco (migração)
- `eleicao_pessoas`: novas colunas `is_voluntario boolean not null default false`, `voluntario_marcado_em timestamptz`, `voluntario_obs text`.
- Índice parcial `(client_id, is_voluntario)` para as consultas do painel.
- Nada de RLS nova: as políticas atuais de `eleicao_pessoas` já cobrem leitura/escrita por cliente.

### Frontend
- `src/components/eleicao/PendentesValorPanel.tsx`
  - carregar também `is_voluntario`, `voluntario_obs`;
  - lista de pendentes passa a filtrar `is_voluntario = false`; nova visão de voluntários;
  - novo estado `regiaoFilter` + `regiaoOptions` derivado dos dados (chave = `regiao` para `campo_grande`, `cidade` para `interior`);
  - ações `marcarVoluntario(ids)` / `desmarcarVoluntario(ids)` com `update` em massa e toast;
  - bloqueio de "Definir valor" para quem está como voluntário.
- `src/components/eleicao/PrevisaoCustos.tsx`: excluir voluntários do somatório e exibir a contagem separada.
- `src/lib/eleicao-contrato-docx.ts`: pular voluntários na geração em lote, reportando-os junto dos "pulados".

## Fora de escopo
Sem alterações em hierarquia, indicações, disparos de WhatsApp ou telemarketing.
