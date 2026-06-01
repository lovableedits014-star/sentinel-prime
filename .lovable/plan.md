## Diagnóstico

### 1. Divergência Total 72 vs Pendentes 73

Em `src/pages/Eleicao.tsx`:

- O KPI **"Total: 72"** (linha 501) usa `stats.total`, que é filtrado pelo escopo atual (`p.escopo === escopo`, ex.: Campo Grande).
- O badge **"Pendentes de valor: 73"** (linhas 606-609) conta `pessoas.filter(...)` **sem filtrar por escopo** — soma Campo Grande + Interior.

Resultado: existe ao menos 1 pessoa no outro escopo (Interior) sem valor definido, que entra no badge mas não no Total exibido. Não é bug de dados — é inconsistência visual.

**Correção:** o badge da aba "Pendentes de valor" deve respeitar o mesmo escopo do KPI "Total" (ou pelo menos deixar isso explícito). Vou alinhar o badge ao escopo ativo, e o painel `PendentesValorPanel` continua mostrando todos com um sub-filtro por escopo.

### 2. Não há como reenviar o fluxo de cadastro do líder após editar o telefone

Hoje o dialog `NotifyProgressDialog` (Coordenador → Secretaria → Líder) só é aberto no `save()` quando é criação nova de líder (linhas 318-325). Se o telefone estava errado e foi corrigido depois, não existe ação para retomar o envio.

No menu de ações da linha (`PessoaRow`, linhas 1395-1455), existem ações de envio só para `tipo === "coordenador"`. Para `lider` não há nada equivalente.

---

## Plano de mudanças (UI apenas, sem alterar lógica do backend)

### A) Corrigir contador "Pendentes de valor"
Em `src/pages/Eleicao.tsx`, fazer o badge da aba `pendentes` contar apenas pessoas do escopo ativo:

```text
pessoas.filter(p => p.escopo === escopo && (!p.valor_contratacao || p.valor_contratacao === 0)).length
```

Assim o número bate visualmente com o KPI "Total" da mesma aba. Reaproveitar `stats.semValor` (já calculado).

### B) Botão "Reenviar fluxo de cadastro" para líderes

No `PessoaRow` (`src/pages/Eleicao.tsx`), adicionar um bloco análogo ao do coordenador, mas para `p.tipo === "lider"`:

- Novo prop opcional `onResendLiderFlow?: (p: Pessoa) => void` no `PessoaRow` / `LiderBlock` / `CoordBlock` / `Section` / `ListaPlana`.
- Item no DropdownMenu da linha do líder:
  - **"🔁 Reenviar fluxo de cadastro"** → abre o `NotifyProgressDialog` para esse líder (seta `notifyPessoaId = p.id` e `notifyOpen = true`), exatamente como acontece hoje na criação.
  - O `NotifyProgressDialog` re-executa as etapas (Coordenador → Secretaria → Líder) usando o telefone atualizado.
- Pequeno ajuste em `NotifyProgressDialog`: hoje o `ranRef` impede rodar de novo para o mesmo `pessoaId`. Vou permitir re-execução manual quando o dialog é reaberto explicitamente (resetar `ranRef.current` no `onClose` ou comparar com um `runKey` incremental, sem mexer no fluxo de criação).

Sem alterações de banco de dados.

---

## Resumo do que será alterado

- `src/pages/Eleicao.tsx`
  - Badge da aba "Pendentes de valor" passa a respeitar o escopo ativo.
  - DropdownMenu da linha de líder ganha "Reenviar fluxo de cadastro".
  - Propagação do handler `onResendLiderFlow` pelos componentes intermediários.
- `src/components/eleicao/NotifyProgressDialog.tsx`
  - Permitir reabrir o dialog para o mesmo `pessoa_id` e disparar novamente as etapas.
