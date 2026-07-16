## Diagnóstico do caso Jaime

Verifiquei no banco:

- **Jaime Sidnei** (`01756eb0…`) hoje: `tipo=coordenador`, `regiao=bandeira`.
- Existem **11 líderes** com `parent_id = Jaime` mas ainda com `regiao='lagoa'` (Adeide, Sebastião, Almiro, Mario, Maria Regina, Lucinda, Josiane, Claudio, Pedro Henrique, Ison, e outros).
- Há também ~10 líderes em `regiao='lagoa'` com `parent_id = null` (avulsos). Não dá pra saber pelo banco se eram do Jaime — vou tratar esses como decisão manual sua.

**Causa raiz:** ao editar um coordenador e mudar `regiao` (ou `escopo`/`cidade`), o `save()` em `src/pages/Eleicao.tsx` só atualiza a linha do próprio coordenador. Não existe trigger no Postgres nem lógica no front que propague `regiao/escopo/cidade` para os descendentes (líderes e cabos). O vínculo `parent_id` continuou intacto, só o campo `regiao` ficou defasado — por isso os líderes "sumiram" ao filtrar por região Bandeira.

## Plano de correção

### 1. Correção do caso do Jaime (data fix pontual)
Migration única, transacional, que só toca descendentes ainda ligados a ele:

```sql
-- Reatribui todos os descendentes (recursivo) do Jaime pra região Bandeira
WITH RECURSIVE desc AS (
  SELECT id FROM eleicao_pessoas WHERE parent_id = '01756eb0-0691-4359-be68-73b2cc135ab4'
  UNION ALL
  SELECT p.id FROM eleicao_pessoas p JOIN desc d ON p.parent_id = d.id
)
UPDATE eleicao_pessoas
SET regiao = 'bandeira', escopo = 'campo_grande'
WHERE id IN (SELECT id FROM desc);
```

Os líderes `lagoa` com `parent_id=null` **não serão tocados** — vou te listar num toast/aba pra você decidir manualmente se algum era do Jaime e reatribuir pelo dialog de edição.

### 2. Prevenir o problema no futuro (propagação automática)

Duas camadas, para ser à prova de bug:

**a) Trigger no Postgres** — nova migration criando `eleicao_pessoas_propagate_scope()` que roda `AFTER UPDATE OF regiao, escopo, cidade`. Quando um coordenador (ou líder) muda esses campos, o trigger atualiza recursivamente todos os descendentes pra manter o mesmo escopo geográfico. Barato: só dispara quando um desses 3 campos muda de valor.

**b) Aviso no front** em `src/pages/Eleicao.tsx` `save()`: quando estiver editando alguém que tem descendentes e a `regiao/escopo/cidade` mudou, mostrar `confirm()`:

> "Este coordenador tem N líder(es) e M cabo(s). Todos serão movidos junto para a região Bandeira. Confirmar?"

Assim você fica ciente da propagação e não é surpreendido.

### Detalhes técnicos

- **Migration 1** (data fix Jaime): update recursivo mostrado acima.
- **Migration 2** (trigger): função `SECURITY DEFINER`, `SET search_path = public`, recursiva via CTE ou loop. Trigger `AFTER UPDATE OF regiao, escopo, cidade ON eleicao_pessoas`. Guardar `pg_trigger_depth() = 0` no início do corpo (ou usar `WHEN`) pra não recursar quando a própria propagação disparar UPDATE nos filhos.
- **Front** (`src/pages/Eleicao.tsx`, função `save`, perto do bloco linhas 391-413): antes do UPDATE, se `editing` e (`form.regiao !== editing.regiao || form.escopo !== editing.escopo || form.cidade !== editing.cidade`), contar descendentes recursivos em `pessoas` e pedir confirmação.
- Sem mudanças em edge functions, sem mudanças de RLS, sem mudanças em tipos gerados.

### Arquivos afetados
- 2 migrations novas (Supabase)
- `src/pages/Eleicao.tsx` (adicionar bloco de confirmação de propagação no `save()`)
