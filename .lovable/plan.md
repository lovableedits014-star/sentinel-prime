## Objetivo

1. Coordenadores **não cadastram mais valores** de líderes nem cabos eleitorais (e nem o próprio valor pode ser definido por eles).
2. ADM tem uma nova aba em **Eleição → Pendentes de valor** onde vê todos os cadastros sem `valor_contratacao` (ou com valor 0), pode atribuir valor **individual ou em massa** (selecionando vários).
3. Para cada pessoa com valor já definido, ADM consegue **gerar contrato em Word (.docx)** individual ou em lote, com 3 modelos distintos: **Coordenador**, **Líder**, **Cabo Eleitoral**.

---

## Mudanças no Portal do Coordenador (bloqueio)

`src/pages/PortalCoordenador.tsx`

- Remover qualquer input/exibição de `valor_contratacao` no formulário de novo líder/cabo (hoje o portal já não envia valor — confirmar removendo do payload se aparecer e nunca exibir o campo).
- Garantir que o `insert` em `eleicao_pessoas` feito pelo portal **não envie** `valor_contratacao` (deixa default `0` / null para sinalizar pendência).
- Adicionar aviso na tela: "O valor do contrato será definido pela administração da campanha."

## Mudanças na página ADM `src/pages/Eleicao.tsx`

### Nova aba principal "Pendentes de valor"

Hoje há `Tabs view = cadastros | custos`. Adicionar uma 3ª aba: **"Pendentes de valor"**.

Conteúdo da aba (novo componente `src/components/eleicao/PendentesValorPanel.tsx`):

- Lista todas as `eleicao_pessoas` do client onde `valor_contratacao IS NULL OR valor_contratacao = 0`.
- Filtros: por tipo (Coordenador/Líder/Cabo), escopo (CG/Interior), região/cidade, busca por nome.
- Cada linha tem checkbox + nome + tipo + região/cidade + líder vinculado + telefone + botão "Definir valor".
- Topo da lista:
  - Botão **"Selecionar todos"**.
  - Quando há ≥1 selecionado: barra de ações fixa com:
    - Input "Valor (R$)" + botão **"Aplicar a N selecionados"** (UPDATE em massa em `eleicao_pessoas.valor_contratacao` filtrando por `id IN (...)`).
    - Botão **"Gerar contratos (.docx)"** (ver seção contratos).
  - Sugestão automática de valor por tipo (presets editáveis) já preenchendo o input quando todos selecionados são do mesmo tipo:
    - Coordenador: R$ 5.000
    - Líder: R$ 2.500
    - Cabo: R$ 1.000
  - Os presets ficam guardados em `localStorage` por client (sem nova tabela).
- Ação individual: o botão "Definir valor" abre um pequeno popover com input + salvar (UPDATE de uma única linha).

Após salvar, recarrega a lista — a pessoa some da aba "Pendentes" automaticamente.

### Cadastros existentes (aba "Cadastros")

- Manter o campo de valor **somente para o ADM** (já é o comportamento atual). Adicionar pequeno badge amarelo "Valor pendente" nas linhas onde `valor_contratacao` é nulo/zero, com link para a nova aba.

## Geração de contrato Word (.docx)

### Templates por tipo

Reaproveitar a tabela existente `contract_templates` (colunas: `id, client_id, tipo, titulo, conteudo`). Hoje só está sendo usada com `tipo` = lider/liderado pelo módulo de Contratados.

Estender o `ContractTemplatesManager` (ou criar um novo gerenciador específico em `src/components/eleicao/EleicaoContractTemplates.tsx`) para suportar três tipos:
- `eleicao_coordenador`
- `eleicao_lider`
- `eleicao_cabo`

Ao instalar a feature, criar via migração 3 templates default (um por tipo) para cada client que ainda não tem, com placeholders:
`{nome} {tipo} {telefone} {endereco} {cidade} {regiao} {lider} {coordenador} {valor} {valor_extenso} {data} {contratante}`.

Adicionar uma sub-seção na página Eleição → Configurações (botão no topo "Modelos de contrato") para o ADM editar esses 3 modelos.

### Geração efetiva (.docx)

Novo helper `src/lib/eleicao-contrato-docx.ts` usando a lib **`docx`** (já no skill set, instalar com `bun add docx`):

- Função `gerarContratoDocx(pessoa, template, contexto)` retorna um `Blob`.
- Substitui placeholders pelos dados da pessoa + lider/coordenador (via lookup em `parent_id`) + nome do client (contratante) + valor formatado em R$ e por extenso.
- Estrutura simples: título em negrito, parágrafos preservando quebras de linha do template, espaço para assinaturas.

Função `gerarContratosLoteZip(pessoas, templates, contexto)`:
- Para cada pessoa escolhe o template do tipo correto.
- Empacota tudo num `.zip` (lib `jszip` — `bun add jszip`) com nomes `Contrato - {nome}.docx`.
- Faz download único.

### Onde aparece

Na aba **Pendentes de valor**:
- Se uma linha já tem valor e foi atribuído agora, fica highlight verde com botão "Baixar contrato".
- Botão de lote gera zip com todos os selecionados que já têm valor.

Na aba **Cadastros** existente: adicionar botão "Contrato (.docx)" por linha que faz download individual usando o template do tipo da pessoa. Se não houver valor definido, botão fica desabilitado com tooltip "Defina o valor do contrato primeiro".

## Banco

Migração necessária:
1. Inserir 3 templates default (`eleicao_coordenador`, `eleicao_lider`, `eleicao_cabo`) em `contract_templates` para cada `client_id` existente que ainda não os tenha (idempotente com `WHERE NOT EXISTS`).
2. Confirmar/relaxar o CHECK do campo `tipo` em `contract_templates` se houver constraint impedindo os novos valores.
3. (Opcional) Política RLS: garantir que `UPDATE` em `eleicao_pessoas.valor_contratacao` exige role do owner/team admin do client — não permitir que portais (coordenador) consigam alterar esse campo. Implementar com policy de UPDATE filtrando por `user_can_access_client` e papel.

## Resumo de arquivos

Novos:
- `src/components/eleicao/PendentesValorPanel.tsx`
- `src/components/eleicao/EleicaoContractTemplates.tsx`
- `src/lib/eleicao-contrato-docx.ts`
- migration: defaults de templates + (opcional) policy de update do valor

Editados:
- `src/pages/Eleicao.tsx` — adiciona aba "Pendentes de valor", botão "Modelos de contrato", botão de download por linha.
- `src/pages/PortalCoordenador.tsx` — remove qualquer input de valor + aviso.
- `src/components/contratados/ContractTemplatesManager.tsx` — opcional, suportar os 3 novos `tipo`.

Deps novas: `docx`, `jszip`.
