
## Diagnóstico — por que suas ligações não apareceram

Confirmei no banco: suas 4 ligações de teste como OPERADOR1 **foram salvas corretamente** em `telemarketing_call_log` (2 "atendeu" + 2 "nao_atendeu", tabela `eleicao_pessoas`).

O bug está nos painéis do admin (`Resultados detalhados` e `Relatórios`):

- Eles usam o hook `useContratadosData`, que só busca **contratados** e **contratado_indicados**.
- Ligações feitas em **eleicao_pessoas**, **eleicao_indicados** e **contatos_avulsos** simplesmente não entram nas estatísticas, no ranking por operador, nem aparecem na lista detalhada.
- Como você testou em contatos da fila de eleição, nada apareceu — mesmo o `tele_registrar_ligacao` tendo gravado tudo certo.

## Correção — uma fonte só de verdade: `telemarketing_call_log`

### 1) Nova RPC `tele_admin_listar_ligacoes(_client_id, filtros)`
Lê de `telemarketing_call_log` (SECURITY DEFINER, restrito a admin do cliente) e devolve, em uma única lista:

```text
id, data_hora, operador_nome, ligacao_status,
tabela (origem: contratado/indicado/eleicao_pessoa/eleicao_indicado/avulso),
contato_id, contato_nome, contato_telefone, cidade, bairro,
vota_candidato, candidato_alternativo, observacao,
campanha_id, campanha_nome
```

Faz `LEFT JOIN` em cada tabela de origem para resolver nome/telefone/campanha. Aceita filtros: `data_de`, `data_ate`, `operador`, `status`, `campanha_id`, `tabela`.

### 2) `TelemarketingResultsPanel` passa a usar essa RPC
- Substitui o input via props (`contratados`, `indicados`) por fetch direto da RPC.
- KPIs (total ligados, atendeu, não atendeu, recusou) calculados sobre o log → mostram **todas** as ligações, de todas as origens.
- Ranking "Por operador" passa a refletir o que cada operador realmente fez.
- Filtro novo: **Origem** (contratados / indicados / eleição-pessoas / eleição-indicados / avulsos) + **Campanha**.
- Cada linha mostra origem e campanha, para você saber de onde veio o contato.

### 3) `TelemarketingReportsPanel` (gráficos + export)
- Mesma RPC alimenta os gráficos de evolução, ranking por bairro, candidato alternativo e comparativo entre rodadas.
- O CSV/PDF de export inclui as novas colunas (origem, campanha).
- Mantém o agrupamento por bairro/cidade já existente.

### 4) Visão geral (KPIs do topo do admin)
Hoje também só conta contratados/indicados. Atualizar para contar `telemarketing_call_log` distintamente por `contato_id` para não inflar duplicado.

## Detalhes técnicos

- **Migration**: cria função `tele_admin_listar_ligacoes` com `SECURITY DEFINER` + `GRANT EXECUTE` para `authenticated`; valida `client_id` contra `has_role(auth.uid(),'admin')` ou membro do client.
- **Sem nova tabela** — `telemarketing_call_log` já tem todos os campos necessários, basta consumir.
- **Performance**: índice em `(client_id, created_at DESC)` se ainda não existir; paginação na lista detalhada (200 por página).
- **Compatibilidade**: o painel `Filas` continua usando os updates nas tabelas-fonte; nada muda no fluxo do operador.

## O que NÃO muda

- Tela do operador (`/telemarketing/:clientId`) e fluxo de salvar ligação.
- Estrutura do `telemarketing_call_log` (já completa).
- Botão "Não atendeu (+1h)" recém-adicionado.

## Entregáveis

1. Migration com `tele_admin_listar_ligacoes`.
2. `TelemarketingResultsPanel` refatorado para consumir a RPC, com filtros por origem e campanha.
3. `TelemarketingReportsPanel` consumindo a RPC para gráficos e export.
4. KPIs da visão geral do admin usando o log unificado.
5. Validação: você refaz o teste com OPERADOR1 → as 4 ligações aparecem em Resultados, no ranking do operador e nos gráficos.
