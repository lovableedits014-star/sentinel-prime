## Objetivo

Permitir que o Super Admin (`lovableedits014@gmail.com`) cadastre usuários da plataforma diretamente (email + senha, já ativos) e libere/bloqueie **uma aba por vez, individualmente**, sem amarrar por seção inteira.

## O que muda para o usuário

Dentro da aba **Super Admin**, abaixo dos blocos atuais (Convites / Clientes / UAZAPI / TSE), aparece um novo cartão **"Usuários da plataforma"** com:

1. **Botão "Novo usuário"** → abre um diálogo com:
   - Nome, Email, Senha (com botão visível/ocultar)
   - **Lista de TODAS as abas individualmente, cada uma com seu próprio checkbox**. As seções (Redes Sociais, Base Política, Mobilização, Operacional, Sistema) servem apenas como **rótulo visual de agrupamento** — não há checkbox de seção. Exemplo de como o usuário verá:

     ```text
     REDES SOCIAIS
       ☐ Comentários
       ☐ Militância Digital
       ☑ Engajamento              ← liberado individualmente
       ☐ Inteligência de Conteúdo

     MOBILIZAÇÃO
       ☑ Missões IA               ← liberado individualmente
       ☑ Funcionários             ← liberado individualmente
       ☐ Controle de Presença
       ☐ Calendário Político
     ```

   - Atalhos opcionais ao lado de cada rótulo de seção: `[liberar todas desta seção]` / `[limpar desta seção]` — e no topo `[liberar tudo]` / `[limpar tudo]`. São apenas atalhos; o estado real continua sendo aba-por-aba.
   - Ao salvar: o usuário é criado já confirmado/ativo, com acesso somente às abas marcadas.

2. **Lista de usuários cadastrados** com:
   - Nome, email, e um resumo "X de Y abas liberadas" + tooltip com a lista
   - Ações: **Editar acessos** (reabre o mesmo diálogo de checkboxes individuais), **Resetar senha**, **Desativar/Reativar**, **Excluir**

## O que muda no acesso

- O menu lateral (`DashboardLayout`) e o guard de rota leem a **lista explícita de paths permitidos** (granular, item a item). Itens não permitidos são ocultados; URL direta a uma aba bloqueada redireciona para a primeira aba liberada.
- Super Admin: acesso total automático.
- Dono de cliente (`clients.user_id`): acesso total automático.
- `team_members` antigos com perfis fixos continuam funcionando (perfil → conjunto de paths apenas em leitura, sem migração destrutiva).

## Detalhes técnicos

### Banco — tabela nova

```text
platform_users
├─ id uuid pk
├─ user_id uuid → auth.users (unique)
├─ name text
├─ email text
├─ allowed_paths text[]      -- ex: ['/engagement','/missoes-ia','/funcionarios']
├─ status text                -- 'active' | 'disabled'
├─ created_by uuid
├─ created_at / updated_at
```

- RLS: SELECT/INSERT/UPDATE/DELETE só para `is_super_admin()`; o próprio usuário pode SELECT só sua linha.
- Enum `app_role` ganha `'platform_user'` (registrado em `user_roles`).

### Edge functions (apenas o que precisa de `auth.admin`)

- `create-platform-user` — valida `is_super_admin()`, cria auth user com `email_confirm: true`, insere em `platform_users` + `user_roles`. Rollback em falha.
- `update-platform-user` — atualiza `allowed_paths`, `status`, nome; opcionalmente reseta senha.
- `delete-platform-user` — remove de `platform_users`, `user_roles` e `auth.users`.

### Frontend

- **`src/lib/access-control.ts`**: novo `ALL_APP_TABS` — array tipado `[{ section, label, path }]` que é a fonte única de verdade tanto para o menu lateral quanto para a UI de checkboxes (assim, ao adicionar uma nova rota no menu ela já aparece nas opções).
- **`useCurrentUserAccess()`** (novo hook React Query): resolve em uma chamada se o usuário é super admin / dono de client / linha em `platform_users`, devolve `{ allowedPaths, isOwner, isSuperAdmin }`.
- **`DashboardLayout.tsx`**: passa a usar esse hook em vez do mapeamento por perfil; oculta itens fora de `allowedPaths`.
- **Novo** `src/components/superadmin/PlatformUsersPanel.tsx`: lista + diálogo de criação/edição com a árvore de **checkboxes por aba individual** (seções são só agrupamento visual).
- **`src/pages/SuperAdmin.tsx`**: monta `PlatformUsersPanel` abaixo dos painéis existentes.

### Catálogo inicial de abas (cada item = 1 checkbox)

```text
Redes Sociais  → /comments, /militancia, /engagement, /inteligencia-conteudo
Base Política  → /pessoas
Mobilização    → /missoes-ia, /funcionarios, /presenca, /calendario-politico
Operacional    → /disparos, /eleicao, /territorial, /inteligencia-eleitoral, /midia
Sistema        → /status-whatsapp, /settings
```

`/dashboard` é sempre liberado (página inicial pós-login) — checkbox vem marcado e desabilitado, fora da contagem.

## Pontos abertos para confirmar antes da implementação

1. O usuário criado pelo super admin enxerga dados de **qual cliente**? (a) nenhum em específico — vê o sistema "global/vazio"; (b) vinculado a um `client_id` escolhido no cadastro. Qual dos dois?
2. O super admin deve poder **trocar a senha** desses usuários a qualquer momento, ou só disparar reset por email?
3. Usuários antigos em `team_members` (perfis fixos) devem ser migrados automaticamente para `platform_users` (convertendo perfil → lista de abas individuais), ou ficam como estão?
