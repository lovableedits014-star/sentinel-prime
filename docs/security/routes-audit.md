# Routes Audit — Onda 1

Mapa de rotas do `src/App.tsx`. Classificação:

- **PUB** — pública intencional (landing, auth, portais por token/clientId).
- **AUTH** — requer usuário logado (gate atual: `DashboardLayout`/`useActiveClientId`).
- **ADMIN** — requer Super Admin (gate atual: `is_super_admin` RPC dentro da página).
- **TOKEN** — autorização via token na URL (validar no servidor).

| Rota | Classe | Gate atual | Endurecimento Onda 2 |
|---|---|---|---|
| `/` (Index) | PUB | — | — |
| `/auth` | PUB | — | — |
| `/signup/:token` | TOKEN | validação server-side do token | confirmar TTL + uso único |
| `/reset-password` | PUB | fluxo Supabase | — |
| `/super-admin` | ADMIN | `supabase.rpc("is_super_admin")` dentro da page | **adicionar `<RequireRole>` em volta** |
| `/cadastro/:clientId` | PUB (portal) | — | confirmar que não vaza PII de outros clients |
| `/cadastro-lider/:token` | TOKEN | token | confirmar TTL |
| `/registro/:clientId` | PUB | redirect | — |
| `/funcionario/:clientId` | PUB | redirect | — |
| `/portal-funcionario/:clientId` | PUB (portal por clientId) | — | rate limit + verificar campos retornados |
| `/portal-coordenador/:clientId` | PUB | — | idem |
| `/portal-contratado/:clientId` | PUB | — | idem |
| `/contratado/:clientId[/:liderId]` | PUB | — | idem |
| `/telemarketing/:clientId` | PUB | — | idem |
| `/portal/:clientId` | PUB | — | idem |
| `/portal-apoiador/:clientId` | PUB | — | idem |
| `/pwa-start` | PUB | — | — |
| `/foto/:clientId` | PUB | — | confirma upload restrito a bucket correto |
| `/dashboard` … `/status-whatsapp` (todas as 22 rotas internas) | AUTH | `DashboardLayout` + RLS no banco | **envolver com `<AuthGate>` aditivo** |
| `*` (NotFound) | PUB | — | — |

## Observações

- O gate real para dados sensíveis é a **RLS no banco** — o gate de rota é UX/defesa em profundidade.
- Os "portais públicos" (`/portal-*/:clientId`) só funcionam porque as queries usam policies específicas para os papéis daquele portal. Validar na Onda 4 que não há SELECT amplo.
- `/super-admin` já está protegido server-side; o `<RequireRole>` é redundante mas barato e melhora UX (não pisca a tela).

## Risco residual

- Nenhum gate global redireciona usuário não autenticado tentando `/dashboard` direto — hoje a página carrega skeleton e o Layout cuida. Funciona, mas `<AuthGate>` torna explícito o comportamento e evita flashes de conteúdo.
