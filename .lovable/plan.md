
# Multi-tenancy: separar clientes (vereadores) de verdade

## Diagnóstico do que existe hoje

Hoje o sistema tem **dois modelos paralelos** convivendo, e isso vai te dar problema assim que entrar o segundo cliente:

**Modelo A — `team_members` (correto, por cliente)**
- Cada linha tem `client_id` + `user_id` + `role`.
- As políticas RLS de `pessoas`, `funcionarios`, `eleicao_pessoas`, `supporters`, `whatsapp_instances` etc. usam `team_members.client_id` para isolar dados.
- Quem entra como `team_member` só enxerga o cliente ao qual está vinculado. ✅

**Modelo B — `platform_users` (problema)**
- Linha do mayer: `email = mayer014@gmail.com`, `allowed_paths = ['/eleicao']`, **`client_id` não existe na tabela**.
- Esse modelo só controla **quais abas** o usuário enxerga, mas **não diz a qual cliente ele pertence**.
- Resultado prático hoje: mayer consegue abrir `/eleicao`, mas como a RLS filtra por `team_members`/`clients.user_id`, ele provavelmente vê **lista vazia** (não está vinculado ao Junior Coringa). Quando entrar o segundo cliente, continua não vendo nada — ou pior, se algum dia uma política for afrouxada, ele veria dados de todos.

**Cliente "Junior Coringa"** existe como `clients.user_id = f32cbbdd...` (a conta dona/vereador), mas **não há nenhum `team_members` cadastrado** para esse cliente. Ou seja: hoje só o próprio dono enxerga os dados; mayer tecnicamente não enxerga nada.

## Como vai ficar (modelo proposto)

Três níveis bem definidos:

```text
Super Admin (você)
   │  pode tudo, cadastra clientes e gerentes
   ▼
Client Owner = Vereador / Deputado  (1 conta = 1 cliente)
   │  dono dos dados daquele gabinete; cadastra a equipe dele
   ▼
Team Member = Gerente / Funcionário / Operacional
   - SEMPRE vinculado a 1 client_id
   - Recebe um conjunto de abas (allowed_paths) E um papel (gerente / operacional)
   - Gerente do cliente X = acesso total às abas do cliente X
   - Operacional = acesso só às abas que o gerente/owner liberou
```

Regra de ouro: **todo usuário não-super-admin tem que estar amarrado a pelo menos um `client_id`**. Se não está amarrado, não vê nada e não pode logar no painel daquele cliente.

## Mudanças no banco

1. **Aposentar `platform_users` como tabela "global"**. Mover seu campo útil (`allowed_paths`) para dentro de `team_members`.
2. Em `team_members` adicionar:
   - `allowed_paths text[]` — lista de abas liberadas (ou `['*']` para gerente).
   - `is_manager boolean default false` — marca o "gerente do cliente" (acesso total às abas daquele cliente, pode cadastrar outros funcionários daquele cliente).
3. Migrar o mayer: criar `team_members(client_id = Junior Coringa, user_id = mayer, allowed_paths = ['/eleicao'], is_manager = false)` e remover a linha de `platform_users`.
4. Permitir que **um usuário tenha várias linhas em `team_members`** (uma por cliente) — assim, no futuro, se um gerente atender 2 vereadores, ele troca de "workspace" no topo da tela.
5. Função `user_can_access_client(client_id)` (já existe) continua sendo a base da RLS — nenhuma RLS de tabela de dados precisa mudar.
6. Nova função `user_allowed_paths(client_id)` para o frontend pedir as abas liberadas naquele workspace.

## Mudanças no app

1. **Seletor de workspace (cliente ativo)** no topo do `DashboardLayout`:
   - Super admin: lista todos os clientes.
   - Usuário comum: lista só os clientes em que ele tem `team_members`. Se for só 1, esconde o seletor.
   - O `client_id` ativo é guardado em contexto e usado por todos os hooks (`useCurrentClientId` passa a ler do contexto, não da primeira linha encontrada).
2. **Painel de cadastro de usuários** vira "por cliente":
   - Tela do super admin: cadastra **clientes** (vereadores) e o **gerente dono** de cada um.
   - Tela do gerente/owner: cadastra **funcionários daquele cliente**, escolhendo quais abas cada um vê.
   - Não existe mais o conceito de "usuário da plataforma" solto sem cliente.
3. **Sidebar/menu**: filtra abas pela interseção de `allowed_paths` do `team_members` daquele cliente ativo (já é o que `access-control.ts` faz, só muda a fonte do dado).
4. **Edge function `manage-platform-user`** é renomeada/reaproveitada para `manage-team-user` e passa a exigir `client_id` em todo create/update.

## Migração dos dados existentes

- Junior Coringa → continua como cliente.
- Conta dona (`f32cbbdd...`) → permanece como `clients.user_id` (owner natural).
- mayer → vira `team_members(client_id = Junior Coringa, allowed_paths = ['/eleicao'])`.
- `platform_users` é mantida temporariamente só para leitura, depois descontinuada.

## Como fica na prática quando entrar o 2º vereador

1. Você (super admin) cria o cliente "Vereador Z" e cadastra o gerente dele (vira `team_members` com `is_manager = true, allowed_paths = ['*']`).
2. O gerente do Vereador Z entra, vê só os dados do Vereador Z (RLS já garante).
3. Ele cadastra os funcionários dele — todos saem com `client_id = Vereador Z`.
4. mayer continua vendo só `/eleicao` do Junior Coringa. Zero risco de cruzar dado.

## Pontos técnicos para você ciente (resumo)

- Nenhuma RLS de tabela de dados precisa ser reescrita — todas já filtram por `client_id` via `team_members`/`clients.user_id`. A correção é **popular `team_members` corretamente** e parar de usar `platform_users` como atalho.
- `useCurrentClientId` hoje pega o **primeiro** client encontrado; vai virar um Context com seletor explícito.
- `is_super_admin()` já é hardcoded no seu e-mail — mantém.

## Pergunta antes de implementar

Quer que o **gerente de um cliente** possa **cadastrar e remover funcionários daquele cliente sozinho** (sem você intervir), ou prefere que **só o super admin** cadastre todo mundo? Isso muda o painel de gestão de usuários.
