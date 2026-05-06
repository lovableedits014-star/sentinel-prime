## Plano final — Pessoas enxuto + vínculo Funcionário↔Coordenador

### 1. Tipos suportados (única fonte da verdade)
A aba `/pessoas` passa a mostrar **só 5 papéis**: Apoiador, Funcionário, Coordenador, Líder, Cabo Eleitoral.

| Papel | Origem |
|---|---|
| Apoiador | `pessoas.tipo_pessoa = 'apoiador'` |
| Funcionário | tabela `funcionarios` |
| Coordenador / Líder / Cabo | `eleicao_pessoas.tipo` |

A leitura é unificada (UNION em memória) + **deduplicação por telefone normalizado**: a mesma pessoa aparece em **uma única linha**, com **vários badges** ("Funcionário" + "Coordenador").

### 2. Vínculo Funcionário ↔ Coordenador (Caminho A)

**Migration:**
```sql
ALTER TABLE eleicao_pessoas
  ADD COLUMN funcionario_id uuid REFERENCES funcionarios(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX eleicao_pessoas_funcionario_role_unique
  ON eleicao_pessoas(client_id, funcionario_id, tipo)
  WHERE funcionario_id IS NOT NULL;
```

**Ajuste no trigger `eleicao_pessoas_prevent_dup`:** se o telefone já é de um funcionário do mesmo client, em vez de bloquear, exigir que o insert venha com `funcionario_id` preenchido apontando para esse funcionário (vínculo, não duplicata).

**Fluxo no Portal do Coordenador (cadastrar coordenador/líder/cabo):**
1. Antes do insert, busca em `funcionarios` por telefone normalizado.
2. Se achou: dialog *"Esse telefone já é do funcionário **Maria Silva**. Vincular esse cadastro ao funcionário existente?"* → ao confirmar, insere em `eleicao_pessoas` com `funcionario_id` setado.
3. Se não achou: insere normal.

Espelhado no cadastro de Funcionário (em `/pessoas` Nova Pessoa → tipo Funcionário): se telefone já é coordenador/líder/cabo, oferece vincular.

### 3. Tela `/pessoas`
**Filtros (4):** Busca por nome, Cidade, Tipo (5 papéis + Todos), WhatsApp.
**Removidos:** Bairro, Nível, Origem, Status Lead, Classificação política, TAG.

**Colunas:** Nome • Telefone • Cidade • Papéis (badges múltiplos) • WhatsApp • Ações.
**Removidas:** Nível, Score, Status Lead, Classificação, TAGs.

(O perfil individual `/pessoas/:id` mantém todos os campos para edição manual quando precisar.)

### 4. Diálogo "Nova Pessoa" enxuto
Campos: Nome, Telefone, E-mail (opcional), CPF (opcional), Cidade, Bairro, **Tipo** (5 opções).

Roteamento por tipo:
- Apoiador → `pessoas` (tipo_pessoa='apoiador')
- Funcionário → `funcionarios`
- Coordenador / Líder / Cabo → `eleicao_pessoas` (com checagem de vínculo)

`EditarPessoaDialog` recebe a mesma poda.

### 5. Disparos
- Manter blocos: Apoiadores, Funcionários, Coordenadores, Líderes, Cabos.
- Remover opção "Contratados" e filtro por TAG do seletor.
- Deduplicação por telefone normalizado antes do envio (evita mandar 2x para o funcionário-coordenador).

### 6. Arquivos afetados
- nova migration SQL (coluna + índice + ajuste do trigger)
- `src/pages/Pessoas.tsx` — query unificada + dedup + filtros/colunas reduzidos
- `src/components/pessoas/NovaPessoaDialog.tsx` e `EditarPessoaDialog.tsx` — campos enxutos + roteamento por tipo + checagem de vínculo
- `src/pages/PortalCoordenador.tsx` — checagem "já é funcionário?" antes de cadastrar
- `src/pages/Disparos.tsx` — limpeza do seletor + dedup por telefone

```text
Telefone X
 ├─ funcionarios (Maria — funcionário)
 └─ eleicao_pessoas (Maria — coordenador, funcionario_id=Maria)
        ↓
    /pessoas mostra: 1 linha "Maria" com badges [Funcionário][Coordenador]
    Disparos: recebe 1 mensagem só
```

Confirma para eu implementar?
