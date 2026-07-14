## Problema

Hoje o dialog de edição em `src/pages/Eleicao.tsx` deixa trocar `tipo` (coordenador → líder → cabo) livremente, sem tratar os subordinados. Se um coordenador vira líder, os líderes/cabos abaixo continuam com `parent_id` apontando para ele — hierarquia quebrada, contatos "invisíveis" na árvore, e sem aviso pro usuário.

O que você quer: ao rebaixar um coordenador a líder, **soltar os subordinados** — líderes abaixo viram líderes avulsos (sem coordenador); cabos continuam ligados aos seus líderes. Nenhum contato é apagado.

## Comportamento por transição

Ao salvar edição com `tipo` mudado, e a pessoa tiver descendentes:

| De → Para | Ação |
|---|---|
| coordenador → líder | Líderes filhos viram avulsos (`parent_id = null`). Cabos filhos diretos (raros) também soltam. O próprio vira líder avulso. |
| coordenador → cabo | Idem acima + o próprio precisa de um líder OU vira "cabo avulso" (`parent_id = null`). Confirmar com aviso extra. |
| líder → cabo | Cabos filhos viram órfãos (`parent_id = null`) — cabo avulso. |
| líder → coordenador | Sobe: mantém subordinados; vira raiz. Sem risco. |
| cabo → líder/coord | Sobe: sem descendentes esperados. Sem risco. |

Em todos os casos: **nada é deletado**. Só `parent_id` é ajustado.

## Fluxo de UX

1. Usuário abre edição, troca `tipo`, clica Salvar.
2. Se houver descendentes que ficarão órfãos com a mudança, abrir dialog de confirmação `RebaixarConfirmDialog`:
   - Mostra contagem: "X líder(es) e Y cabo(s) abaixo desta pessoa."
   - Explica: "Ao rebaixar, esses contatos serão desvinculados (viram avulsos) mas **não serão apagados**. Você poderá reatribuí-los depois."
   - Botões: `Cancelar` / `Confirmar rebaixamento`.
3. Ao confirmar: `UPDATE eleicao_pessoas SET parent_id = NULL WHERE parent_id = <id_editado>` + update do próprio registro com novo `tipo` (e `parent_id = null` se for raiz agora).
4. Toast: "Cadastro atualizado. N contatos foram desvinculados e agora aparecem como avulsos."

## Onde ficam os "avulsos"

Já existe suporte visual: líder com `parent_id = null` aparece como **líder avulso** (checkbox `liderAvulso` no form). Para cabos avulsos (`parent_id = null` + `tipo = cabo`), verificar se a listagem atual mostra — se não, adicionar uma seção "Cabos sem líder" na aba correspondente para o usuário conseguir reatribuir. Vou confirmar durante a implementação e ajustar se preciso.

## Arquivos

- `src/pages/Eleicao.tsx` — função `save()`: detectar mudança de tipo com descendentes órfãos; abrir novo dialog; após confirmação, executar update em massa dos filhos + update da própria pessoa.
- `src/components/eleicao/RebaixarConfirmDialog.tsx` — novo componente de confirmação (contagem + aviso + botões).
- Verificação de listagem de "cabos avulsos" — se estiver oculta hoje, ajuste mínimo na renderização da árvore para exibir seção separada.

Sem migrations. Sem mudança de schema. Sem edge functions.

## Detalhes técnicos

```ts
// Em save(), antes do update:
if (editing && editing.tipo !== form.tipo) {
  const descendentes = pessoas.filter(p => p.parent_id === editing.id);
  const perdeSubordinados =
    (editing.tipo === "coordenador" && form.tipo !== "coordenador") ||
    (editing.tipo === "lider" && form.tipo === "cabo");
  if (perdeSubordinados && descendentes.length > 0) {
    // abrir RebaixarConfirmDialog; on confirm:
    await supabase.from("eleicao_pessoas")
      .update({ parent_id: null })
      .eq("parent_id", editing.id);
    // então segue com o update normal do próprio registro
  }
}
```

Trigger `trg_heranca_dobradinha` roda em `parent_id` update — filhos que viram avulsos vão herdar do próprio (raiz agora), ou preservar dobradinha atual. Sem quebra.
