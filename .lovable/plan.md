## Bug: bairro aparece como "rua" ao editar cadastros antigos

### Diagnóstico

Investigação no banco (`eleicao_pessoas`, 105 registros):
- **0 registros** têm `rua = bairro` no banco — os dados ainda estão íntegros.
- **58 registros** têm `endereco = bairro` (cadastros onde só o bairro foi informado; o campo legado `endereco` ficou com o nome do bairro).

A causa visual está em **`src/pages/Eleicao.tsx` linha 277**, na função `openEdit()`:

```ts
const legado = p.endereco || "";
setForm({
  ...
  rua: p.rua || legado,   // ← bug: quando rua está vazia, cai no endereco
  ...
  bairro: p.bairro || "",
});
```

Esse fallback foi adicionado para migrar registros muito antigos (quando só existia o campo `endereco`). Mas para os 58 cadastros onde o `endereco` foi gerado a partir só do bairro (ex.: `endereco = "Moreninhas"`), o formulário de edição abre com **Rua: Moreninhas / Bairro: Moreninhas**. Se o usuário salvar sem limpar, o `rua` passa a guardar o bairro de verdade e o `endereco` vira `"Moreninhas - Moreninhas"`. O mesmo fallback existe em `src/lib/eleicao-fluxo-cadastro.ts` linha 167 (mensagem de boas-vindas mostra `Rua: Moreninhas`).

Como ainda não há linhas corrompidas no banco, não precisa de backfill — basta corrigir o fallback.

### Plano

1. **`src/pages/Eleicao.tsx` (linha 270–280, `openEdit`)**
   - Tratar `endereco` como legado **apenas** quando ele realmente parece conter rua (diferente do bairro e do `"rua - bairro"` que o próprio sistema concatena hoje). Caso contrário, deixar `rua` em branco.
   - Lógica: `rua: p.rua || (legado && legado !== p.bairro && !legado.endsWith(` - ${p.bairro}`) ? legado : "")`.

2. **`src/lib/eleicao-fluxo-cadastro.ts` (linha 167, montagem das vars da mensagem)**
   - Aplicar a mesma proteção: `rua: p.rua || (p.endereco && p.endereco !== p.bairro ? p.endereco : "—")` para a mensagem de boas-vindas não imprimir o bairro como rua.

3. **Sem migração de dados.** Os 58 registros com `endereco = bairro` continuam corretos no banco (rua/numero nulos, bairro preenchido). A correção do fallback impede que futuras edições corrompam esses registros.

4. **QA rápido após o build:** abrir um cadastro tipo `Moreninhas` (ex.: João Leite, Vanderley), confirmar que o campo Rua aparece vazio e que salvar mantém `rua = null` no banco.

### Fora do escopo

- Não vou mexer no schema nem rodar UPDATE em massa.
- Não vou alterar a lógica de salvar (`save()`) — ela já trata `rua` vazio corretamente (`numero: numero || null`, concat opcional).