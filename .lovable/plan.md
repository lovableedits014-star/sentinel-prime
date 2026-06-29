## Problema confirmado

Quando você pesquisa "luciana", o sistema **conta corretamente** as 2 pessoas na Moreninha (badge mostra "Moreninha 2"), mas só exibe 1 — a Luciana Dantas, que é **avulsa**. A outra Luciana (a do telefone 67 9211-3443) está **vinculada ao coordenador Humberto Cantuario** e fica escondida dentro do bloco do coordenador, que está colapsado.

A busca filtra a pessoa corretamente no banco, mas o componente do coordenador não se abre automaticamente para mostrar o resultado, então quem pesquisa acha que ela não existe.

## Correção

### 1. Coordenadores se abrem sozinhos quando há resultado dentro deles
Quando você está pesquisando e algum líder ou cabo da equipe do coordenador bate com a busca:

- O bloco do coordenador abre automaticamente.
- Os líderes que não batem com a busca ficam ocultos (só aparece a pessoa procurada).
- O bloco mostra um aviso amarelo do tipo "1 resultado encontrado na equipe".

Sem busca ativa, comportamento atual continua igual (coordenadores colapsados).

### 2. Cada linha mostra a quem está vinculada
Em toda linha de líder ou cabo, abaixo do nome aparece de forma discreta:

- Para líder vinculado: "Vinculado ao coordenador Humberto Cantuario"
- Para cabo vinculado a líder: "Vinculado ao líder X / coordenador Y"
- Para avulso: "Líder avulso (sem coordenador)" — já existe hoje.

Assim, quando você achar a pessoa, já sabe imediatamente de quem ela depende.

### 3. Contador da região reflete só o que está visível
Quando há busca ativa e a região mostra "2 resultados", os 2 devem realmente aparecer na lista. O auto-expandir do item 1 já garante isso.

### 4. Ao tentar cadastrar telefone duplicado, mostrar onde está
Quando o sistema bloquear "telefone já cadastrado", a mensagem passa a incluir:

- Nome cadastrado, tipo (coordenador/líder/cabo), região.
- Se vinculada, o nome do coordenador/líder responsável.

Exemplo: "Telefone já cadastrado: **Luciana** — Líder na Moreninha, vinculada ao coordenador Humberto Cantuario."

## Arquivo afetado

- `src/pages/Eleicao.tsx` (componentes `CoordBlock`, `LiderBlock`, `PessoaRow` e validação de duplicidade no formulário de cadastro).

## Resultado esperado

Ao pesquisar **luciana** ou **9211-3443**, as duas Lucianas da Moreninha aparecem visíveis na hora, com o nome do coordenador ao lado das que estão vinculadas. Nenhum cadastro fica mais "invisível" por estar dentro de um coordenador fechado.