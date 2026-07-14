## Problema

Na exportação (PDF simples e CSV/PDF raiz), a coluna **Região/Cidade** exibe sempre "Campo Grande" para todos os cadastros da capital, porque o código faz `p.cidade || p.regiao` — e em CG `cidade = "Campo Grande"` sempre vence, mascarando a região urbana real (centro, moreninha, segredo, prosa, etc.) que está gravada em `regiao`.

Para o Interior, o campo `regiao` é nulo e a `cidade` é o município — o comportamento atual está correto.

## Correção

Em `src/lib/eleicao-export-pdf.ts`, inverter a precedência: **usar `regiao` (região urbana de CG) quando existir; senão cair para `cidade`**. Aplicar em todos os pontos:

1. `sortByRegiaoNome` — chave passa a ser `regiao || cidade` (garante ordenação por região urbana em CG).
2. PDF simples (tabela por tipo) — coluna "Região/Cidade": `cap(p.regiao) || p.cidade`.
3. Cabeçalho do bloco na exportação raiz (linha do coordenador) — mesmo critério.
4. Coluna "Bairro/Cidade" da tabela raiz (líder/cabo) — manter `bairro || regiao || cidade` (prioriza bairro, que é mais fino que região urbana).

Renomear o cabeçalho da coluna de "Região/Cidade" para **"Região/Cidade"** (mantido) — o rótulo já cobre os dois casos; só o conteúdo estava errado.

## Dobradinha na exportação

Verificado: já funciona. `ExportEleicaoDialog` tem filtro por dobradinha (todas / sem dobradinha / parceiro específico) e a opção "Gerar um arquivo por dobradinha" segmenta a saída. Nenhuma mudança necessária — apenas confirmar no diálogo após o ajuste da coluna.

## Arquivos

- `src/lib/eleicao-export-pdf.ts` (única alteração)

## Detalhes técnicos

```ts
// antes
cap(p.cidade || p.regiao)
// depois
p.regiao ? cap(p.regiao) : (p.cidade || "—")

// sortByRegiaoNome
const ra = (a.regiao || a.cidade || "").toLowerCase();
```

Sem mudanças em migrations, schema, ou lógica de negócio.