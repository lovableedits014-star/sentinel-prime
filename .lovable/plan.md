
## O erro que cometi

Você está absolutamente certo — pisei na bola. Eu li o banco e vi "36 usuários com `role='client'`", e assumi que todos eram gerentes do SaaS. Errado. A maioria são pessoas do CRM (coordenadores/líderes/cabos) que ganharam conta `auth.users` só pra acessar o **portal**, não pra usar o sistema como gerente.

**O que eu confirmei agora no banco:**

- Há **37 usuários** em `auth.users`.
- **25 deles** existem também na tabela `public.pessoas` — ou seja, são contatos do CRM (eleitores/coordenadores) que receberam credencial de portal via a função `eleicao-create-account`. Foram criados em lote no dia 26/04.
- **3 são funcionários/team_members** (`mayer014@*`, `antoniolobato.adm`).
- **Apenas 2 são gerentes legítimos** do SaaS:
  - **Junior Coringa** (super admin)
  - **Wellington Kester**
- O resto (alguns avulsos como `jacinto.alves004`, `helioalvesvaz`, `decaosales`, `rodferros`) parecem casos de pessoa cadastrada e depois removida do CRM, mas com `auth.users` órfão.

E o que minha última migração fez de errado:

1. Criou **35 fichas de gerente bobas** em `public.clients` — uma pra cada um desses usuários do portal/CRM. Eles agora aparecem todos no seletor de "Gerente" do super admin como se fossem clientes SaaS.
2. Mantive o trigger `handle_new_user` criando `clients` automaticamente — o que significa que toda nova pessoa cadastrada via portal viraria "gerente" também.

A raiz do problema vinha de antes inclusive: o trigger `handle_new_user` já vinha marcando **todo mundo** com `role='client'`, sem distinguir gerente de pessoa-com-portal.

---

## Plano de correção

### 1. Limpar as fichas de gerente criadas por engano

Manter em `public.clients` **somente**:
- Junior Coringa (`lovableedits014@gmail.com`)
- Wellington Kester (`wellington.advogado2013@gmail.com`)

Apagar as outras 35 fichas que minha migração criou. Como nenhuma delas tem dados reais (foram criadas em branco há poucos minutos), a deleção é segura. As pessoas em `public.pessoas` continuam intactas — só estou removendo o "rótulo de gerente" indevido.

### 2. Separar os papéis no `user_roles`

Criar um novo valor de role mais honesto, **`portal_pessoa`** (no enum `app_role`), pra contas que existem só pra acessar o portal do coordenador/líder.

Reclassificar:
- Os **25 usuários que estão em `pessoas`** → `role = 'portal_pessoa'` (não são clientes SaaS, têm acesso só ao portal deles).
- Os **funcionários/team_members** → manter como `funcionario` (já está certo).
- **Junior + Wellington** → manter como `client` (são gerentes de verdade).
- Os ~4 "auth.users órfãos" (sem pessoa, sem cliente, sem time) → vou listar pra você decidir caso a caso (provavelmente bagunça de testes; podem virar `portal_pessoa` inativo ou ser apagados).

### 3. Corrigir o trigger `handle_new_user` para nunca mais "auto-promover" alguém a gerente

Reescrever pra:

- **Sempre** criar `profiles` (continua igual).
- **Não** atribuir `role='client'` automaticamente.
- Em vez disso, ler `raw_user_meta_data->>'account_type'` na criação:
  - `'gerente'` → cria `user_roles.role='client'` **e** a ficha em `public.clients`.
  - `'portal_pessoa'` → cria `user_roles.role='portal_pessoa'`, nada em `clients`.
  - `'funcionario'` → cria `user_roles.role='funcionario'`, nada em `clients`.
  - Sem metadata → fica sem role (seguro: ninguém vira gerente por engano).
- Atualizar `eleicao-create-account` e `register-funcionario` pra passarem o `account_type` certo no `signUp`/`admin.createUser`.

### 4. Criar fluxo explícito "Novo gerente" no painel do super admin

Hoje não existe UI pra super admin criar um gerente "do zero" — Junior foi cadastrado manualmente no banco, Wellington também. Vou adicionar uma ação **"Cadastrar novo gerente"** no `SuperAdminClientSwitcher` que:

1. Chama uma server function nova (`createGerente`) que: cria `auth.user` com `account_type='gerente'`, gera senha, cria a ficha em `clients` e o `user_roles.role='client'` (de forma atômica via service role).
2. Devolve as credenciais pra você compartilhar com o novo gerente.

Assim, "criar gerente" deixa de ser implícito e passa a ser uma ação consciente.

### 5. Após a correção — fluxo final

- Super admin (Junior) abre o seletor "Gerente" → vê **apenas** Wellington (e qualquer outro que ele criar pelo botão novo).
- Seleciona Wellington → cria instância WhatsApp pra ele → Wellington loga e usa.
- Cadastrar um coordenador/líder/cabo no CRM continua gerando conta de portal, mas essa conta **nunca** mais vira gerente do SaaS.

---

## Detalhes técnicos (referência)

- **Migração** única com: `DELETE FROM clients WHERE user_id NOT IN (junior, wellington)`; `ALTER TYPE app_role ADD VALUE 'portal_pessoa'`; `UPDATE user_roles SET role='portal_pessoa' WHERE user_id IN (select user_id where in pessoas)`; `CREATE OR REPLACE FUNCTION handle_new_user` com a lógica baseada em `account_type`.
- **Código edge**: ajustar `eleicao-create-account/index.ts` pra passar `user_metadata: { account_type: 'portal_pessoa' }` no `admin.createUser`. Mesmo pra `register-funcionario` (`account_type: 'funcionario'`).
- **Nova server function** `src/lib/admin.functions.ts → createGerente` + dialog no `SuperAdminClientSwitcher`.
- **Sem alteração** na instância existente de WhatsApp do Junior.

---

### Antes de eu rodar, preciso de uma confirmação

Os ~4 auth.users **órfãos** (existem em `auth.users`, têm `role='client'`, mas NÃO existem em `pessoas`, `team_members` ou `funcionarios`) são:

- `jacinto.alves004@gmail.com`
- `helioalvesvaz@gmail.com`
- `decaosales@gmail.com`
- `rodferros@hotmail.com`
- (mais alguns possíveis — listo todos na execução)

**O que faço com eles?**
- (A) Deixar como `portal_pessoa` desativado (não vira gerente, mas conta segue existindo).
- (B) Deletar a conta `auth.users` deles também (limpa de vez).

Me diz qual prefere — se não responder, vou de (A) por ser o caminho menos destrutivo.
