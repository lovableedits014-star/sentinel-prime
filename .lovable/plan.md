## Objetivo

Permitir que o **gerente** cadastre usuários da equipe dele com permissões **aba por aba**, exatamente como o Super Admin faz no painel `PlatformUsersPanel`.

## Situação atual

- `src/components/team/TeamUsersPanel.tsx` (usado em `/settings`) ainda usa o modelo **legado de perfis fixos** (`gestor_social`, `gestor_campanha`, `operacional`) e chama a edge `create-team-user`. Não permite escolher abas individualmente.
- `src/components/superadmin/PlatformUsersPanel.tsx` já tem a UI completa de permissões aba por aba (checkbox por tab, "Liberar seção", "Liberar tudo", switch "Gerente do cliente") e chama a edge `manage-platform-user`.
- A edge `manage-platform-user` **já autoriza o gerente**: a função `canManageClient` aceita super admin, dono do client, **ou** `team_members.is_manager = true` para o mesmo `client_id`. Ou seja, o backend está pronto.

## Mudança

Reescrever `src/components/team/TeamUsersPanel.tsx` reaproveitando a lógica de `PlatformUsersPanel`, com duas adaptações:

1. **Escopo travado a um único cliente**: o componente recebe `clientId` por prop (já recebe), não exibe seletor de cliente nem filtro "Todos os clientes". Todas as queries usam `.eq("client_id", clientId)` e o `body.client_id` no `create` vai fixo.
2. **Sem opção "Gerente do cliente"** no formulário: o gerente cadastra membros da equipe dele com permissões granulares; promover outro a gerente continua sendo prerrogativa do Super Admin (evita escalada de privilégio entre gerentes). O `is_manager` enviado é sempre `false`.

Restante igual ao `PlatformUsersPanel`:
- Lista de usuários com badges (status, contagem de abas).
- Botões editar / ativar-desativar / excluir → `manage-platform-user` com `action: "update" | "delete"`.
- Diálogo com:
  - Nome, Email (desabilitado em edição), Senha (opcional em edição).
  - Card "Acesso por aba" usando `ALL_APP_TABS`/`SECTION_ORDER`/`tabsBySection` de `@/lib/access-control`.
  - Checkbox "Dashboard sempre liberado" (informativo).
  - Por seção: botão "Liberar seção" / "Limpar seção".
  - Botões globais "Liberar tudo" / "Limpar tudo".
- Salvar chama `supabase.functions.invoke("manage-platform-user", { body: { action, client_id, name, email, password, allowed_paths, is_manager: false, ... } })`.

## Escopo

- **1 arquivo reescrito:** `src/components/team/TeamUsersPanel.tsx`.
- Sem mudanças no banco, sem mudanças em edge functions (a `manage-platform-user` já cobre o caso do gerente).
- Sem mudanças em `PlatformUsersPanel` (Super Admin continua igual).
- A edge `create-team-user` deixa de ser usada por este painel (pode permanecer no projeto sem impacto).

## Verificação

Logado como gerente em `/settings` → card "Usuários da Equipe":
1. "Novo usuário" abre o diálogo com checkboxes por aba agrupados por seção.
2. Marcar abas e salvar cria o `team_members` vinculado ao `client_id` do gerente, com `allowed_paths` populado e `is_manager = false`.
3. O usuário criado faz login e enxerga apenas as abas marcadas (lógica de `DashboardLayout` já respeita `allowed_paths`).
4. Editar permite trocar abas / resetar senha; desativar/excluir funcionam.