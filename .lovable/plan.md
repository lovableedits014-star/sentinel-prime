
## Diagnóstico — o que está acontecendo hoje

Investiguei o banco e encontrei a causa-raiz do problema com o Wellington (e na verdade com **todos os outros usuários** que você cadastrou).

**Estado atual confirmado no banco:**

- Existem **37 usuários** cadastrados em `auth.users`.
- **36** deles têm `role = 'client'` em `user_roles`.
- Mas a tabela `public.clients` (que é a "ficha do cliente" — onde ficam configurações de WhatsApp, presença, janela de envio, logo, etc.) tem **apenas 1 linha**: a do **Junior Coringa** (`lovableedits014@gmail.com`).
- Wellington (`wellington.advogado2013@gmail.com`) tem usuário e tem role `client`, mas **não tem linha em `clients`** — por isso o sistema não acha "cliente" pra ele e cai de volta no Junior.
- A função `is_super_admin()` está fixada no e-mail do Junior. Ele é, ao mesmo tempo, super admin **e** dono da única ficha de cliente — exatamente o que você quer separar.
- O trigger `handle_new_user` cria `profiles` + `user_roles`, mas **nunca criou** linha em `clients`. Por isso o Wellington (e os outros 35) ficaram "órfãos".
- A única instância de WhatsApp existente (`279b290d…`) está corretamente atribuída ao cliente do Junior — confirmando seu princípio: "tudo que temos hoje é do Junior Coringa".
- O `SuperAdminClientSwitcher` lê da tabela `clients` — como só tem o Junior lá, **não aparece ninguém pra você selecionar/impersonar**, e qualquer instância que você tentar criar acaba indo pro Junior.

**Conclusão:** o problema não é a tela de criar instância — ela já está correta após o último ajuste. O problema é que **os clientes nunca foram criados no banco**. Sem ficha de cliente, não há `client_id` válido pra anexar a instância.

---

## Plano de correção

### 1. Backfill — criar ficha de cliente para todos os 36 usuários órfãos

Para cada usuário com `role='client'` que ainda não tem linha em `public.clients`, criar uma com:
- `user_id` = id do usuário
- `name` = `full_name` do profile (ou e-mail, se vazio)
- demais campos com os padrões já definidos na tabela (janela de WhatsApp, etc.)

Isso faz o Wellington (e todo mundo) aparecer no seletor de gerente do super admin e ter um `client_id` próprio onde anexar instâncias.

### 2. Trigger — garantir que novos usuários ganhem ficha automaticamente

Atualizar `public.handle_new_user()` para também inserir em `public.clients` no cadastro. Assim, ninguém mais vai ficar "órfão" no futuro.

### 3. RLS — super admin enxerga e gerencia todas as fichas de cliente

Hoje as policies de `public.clients` só permitem o dono ver/editar a própria ficha (e `admin` apenas ver). Adicionar/ajustar policies para que **super admin** possa:
- listar todas as fichas (pra aparecer no seletor)
- criar/atualizar quando estiver gerenciando um cliente
- nunca aparecer como "dono" — o `user_id` da ficha continua sendo do cliente real

Isso reforça sua regra: **super admin gerencia, mas não é dono**.

### 4. Verificação da instância existente do Junior

A instância `279b290d…` permanece como está: ela é do cliente do Junior, conectada, primária. Nada muda. Continua sendo "tudo do Junior".

### 5. Como vai funcionar depois da correção (fluxo final)

1. Você loga como super admin (Junior).
2. Abre o seletor "Gerente" no menu lateral — agora aparece **a lista completa** (Wellington, todos os outros).
3. Seleciona "Wellington" → o sistema passa a operar **como** o cliente do Wellington (sem alterar a dono-ria da ficha).
4. Vai em Configurações → WhatsApp → "Adicionar instância". A instância é criada **anexada ao `client_id` do Wellington** (não ao do Junior).
5. Wellington loga com a conta dele e vê/usa a instância normalmente — porque ela está na ficha **dele**.

### Detalhes técnicos (para referência)

- Migração SQL única com: `INSERT … SELECT` para backfill; `CREATE OR REPLACE FUNCTION handle_new_user` com o `INSERT public.clients`; `DROP/CREATE POLICY` em `clients` adicionando `is_super_admin()` no `USING`/`WITH CHECK` de SELECT, INSERT e UPDATE.
- A função `is_super_admin()` continua hardcoded no e-mail do Junior (do jeito que já está) — não estou mexendo nisso agora.
- A instância existente não é tocada. As fichas backfilladas ficam com configurações padrão; cada cliente edita as próprias depois.
- Nenhuma alteração em código front-end é necessária — `useActiveClientId`, `resolveClientId` e `SuperAdminClientSwitcher` já estão prontos pra esse fluxo, só precisavam que as fichas existissem.

Quando você aprovar, eu rodo a migração e te aviso pra retestar criando uma instância pro Wellington.
