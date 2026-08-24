# Correção da criação de filas + adicionar contatos depois

## O que está acontecendo (verificado)

O erro `Origem de contatos inválida: indicados_eleicao` vem do banco: a função que cria a fila (`tele_create_fila_wizard`) só sabe tratar duas origens — planilha (CSV) e "estrutura". As outras três opções que o assistente oferece na tela (Indicados da eleição, Contratados, Indicados de contratados) caem no `ELSE` e lançam exceção. Ou seja: a tela oferece origens que o banco nunca implementou.

Também confirmei três incoerências relacionadas:

1. Já existe uma função pronta e correta para vincular indicados da eleição a uma fila (`tele_designar_eleicao_indicados`), mas o assistente nunca a chama.
2. Essa função exige que o usuário seja o **dono** da conta, enquanto a criação da fila aceita administradores de equipe. Um admin de equipe conseguiria criar a fila mas não popular.
3. O assistente envia cidade/bairro no formato `%texto%` e a chave `tipo`, enquanto a função de indicados espera texto exato e a chave `indicador_tipo`. Mesmo se fosse chamada hoje, os filtros de cidade/bairro/cargo não bateriam.

Não existe hoje nenhum caminho para **adicionar contatos a uma fila já criada** — a única forma é criar outra fila.

## O que vou fazer

### 1. Corrigir a criação da fila (todas as origens)

- Passar a tratar no banco as origens `Indicados (eleição)`, `Contratados` e `Indicados de contratados`, além de CSV e estrutura.
- Padronizar os filtros entre a tela e o banco (cidade/bairro com busca parcial, cargo/indicador com o mesmo nome de campo), para que "indicados do Leiton" realmente filtre pelo indicador escolhido.
- Alinhar a checagem de permissão: quem pode criar a fila pode popular a fila (dono da conta ou admin de equipe).
- Mostrar na revisão final (passo 6) a **prévia de quantos contatos** entrarão, e bloquear a criação silenciosa com zero contatos (aviso claro em vez de fila vazia).

### 2. Adicionar contatos a uma fila existente

- Novo botão **"Adicionar contatos"** no cartão de cada fila (em Filas de ligação).
- Abre um diálogo reduzido com os mesmos passos úteis: escolher origem (planilha, estrutura, indicados da eleição, contratados), aplicar filtros, ver prévia da quantidade, escolher se já designa para um operador ou divide entre vários.
- Reaproveita a mesma lógica de povoamento da criação, agora apontando para a fila existente — sem duplicar contato que já está na fila.
- Deduplicação por telefone continua valendo: contato repetido é ignorado e reportado ("X duplicados ignorados").

### 3. Melhorias do levantamento que faltavam (encontradas na varredura)

- **Prévia antes de confirmar** em todas as origens (hoje só existe para planilha), evitando criar fila vazia sem perceber.
- **Contatos já em outra fila**: hoje o comportamento de "substituir" fica escondido. Vou explicitar: "ignorar quem já está em outra fila" (padrão) ou "mover para esta fila", com a contagem de cada caso na prévia.
- **Remover contatos da fila** e **liberar designação** direto do diálogo de gerenciamento, para corrigir erro de importação sem apagar a fila.
- **Origem registrada na fila**: guardar de onde vieram os contatos e o filtro usado, e exibir isso no cartão da fila (ex.: "Indicados de Leiton · não ligados"), para rastrear o levantamento.
- **Reexecutar o levantamento**: botão "Buscar novos indicados com o mesmo filtro", que traz apenas quem foi cadastrado depois — é o caso mais comum, já que a lista do Leiton cresce ao longo dos dias.

## Detalhes técnicos

- Migração: reescrever `public.tele_create_fila_wizard` para delegar a uma nova função `public.tele_popular_fila(_client_id, _campanha_id, _origem, _filtros, _csv_rows, _substituir)` com ramos para `csv`, `estrutura`, `indicados_eleicao` (via `eleicao_indicados`), `contratados` e `indicados_contratados` (via `contratado_indicados`); usar `_tele_assert_client_admin` em todas.
- Nova função `public.tele_preview_fila(_client_id, _origem, _filtros)` retornando `{ total, pendentes, ja_em_outra_fila }` para a prévia unificada; `tele_preview_eleicao_indicados` passa a ser um caso interno.
- Ajustar `tele_designar_eleicao_indicados` para aceitar `ILIKE` em cidade/bairro e a chave `tipo`, mantendo compatibilidade.
- Frontend: `NovaFilaWizard.tsx` passa a chamar a prévia no passo 6 e a normalizar os filtros; novo `AdicionarContatosDialog.tsx`; botão e chip de origem em `TelemarketingAdminFilas.tsx`; remoção/liberação em `AtribuicoesDialog.tsx`.
