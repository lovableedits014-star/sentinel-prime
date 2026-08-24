# Correção do Telemarketing: designações, busca de indicador e ajuda em todas as abas

## 1. Erro ao abrir "Gerenciar designações" (verificado)

O diálogo de designações carrega a lista de listas ordenando por `created_at`, mas a tabela `telemarketing_listas` não tem essa coluna — o campo de data se chama `criado_em`. Como as duas consultas do diálogo são feitas juntas, o erro derruba tudo e a tela fica vazia.

Correção: ordenar por `criado_em` e tornar a busca de listas tolerante a falha (se as listas não carregarem, os contatos ainda aparecem, com um aviso discreto em vez de tela vazia).

## 2. Buscar indicador por nome

Hoje o campo "Indicado por" é um seletor simples com centenas de nomes, obrigando a rolar tudo.

- Trocar por um campo de busca com autocomplete (digita parte do nome e a lista filtra na hora), mostrando o cargo (coordenador/líder/cabo) e a cidade ao lado do nome.
- Mesma troca nos dois lugares onde esse filtro aparece: assistente de nova fila e diálogo "Adicionar contatos".
- Manter a opção "Qualquer indicador" e o comportamento atual de filtro/prévia.

## 3. Explicações em todas as abas de telemarketing

Adicionar textos de ajuda consistentes em cada aba (Visão geral, Filas, Listas, Resultados, Relatórios, Ranking, Operadores, Configurações):

- Uma linha de descrição abaixo do título de cada aba explicando para que serve e o que fazer ali.
- Ícone de ajuda (?) nos botões e blocos que costumam gerar dúvida: "Adicionar contatos", "Gerenciar designações", "Redistribuir fila", "Buscar novos", "Remover da fila", "Pool livre", origem da fila, status de ligação.
- No diálogo de designações, explicar a diferença entre atribuído a um operador e pool livre, e o que cada ação faz.
- Textos curtos, em português, escritos para quem opera a campanha (sem termos técnicos).

## Detalhes técnicos

- `AtribuicoesDialog.tsx`: `order('criado_em')`; separar os dois fetches para que o erro de listas não bloqueie os contatos.
- Novo componente `IndicadorCombobox.tsx` (Popover + Command, já disponíveis no projeto) consumindo o mesmo `tele_list_indicadores`; usado em `NovaFilaWizard.tsx` e `AdicionarContatosDialog.tsx`.
- Novo componente `TeleHelp.tsx` (tooltip com ícone de ajuda) e um mapa central de textos (`telemarketing-help.ts`) reaproveitado pelas páginas `TelemarketingAdmin*.tsx` e pelos diálogos.
- Nenhuma mudança de banco necessária.
