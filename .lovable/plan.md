## Diagnóstico (verificado)

Testei `HEAD` nos dois links da última campanha:

- `https://f504a57a-…lovableproject.com/missao/<id>` → **302 → `lovable.dev/auth-bridge?…`**
- `https://id-preview--…lovable.app/missao/<id>` → **302 → `lovable.dev/auth-bridge?…`**

Ou seja: os links de missão apontam para o **preview do Lovable, que é bloqueado por auth**. Qualquer pessoa que recebe no WhatsApp cai na tela de login do Lovable — daí a percepção de "link inválido" e, dependendo do fluxo do auth-bridge, o navegador acaba caindo em outra rota pública (ex.: `/g/<slug>` da galeria) ou numa tela genérica.

Causa raiz:
1. `handleUseMissions` / `handleSend` em `src/pages/Disparos.tsx` montam a URL com `window.location.origin`, que hoje é o preview.
2. `project_urls` confirma que este projeto **ainda não está publicado**, então não existe domínio público para servir a rota `/missao/:missionId`.
3. Só as rotas `/api/public/*` do TanStack Start ficam livres de auth. A página `/missao/:missionId` mora em `src/App.tsx` (SPA React Router) — portanto herda o gate do preview.

## O que vamos fazer (mínimo para destravar)

### Passo 1 — Publicar o projeto (ação sua)
É o único caminho que expõe `<slug>.lovable.app` publicamente e faz `/missao/:missionId` responder sem auth-bridge. Vou lembrar disso na UI (passo 3) e no botão de "Usar missões".

### Passo 2 — Base URL pública configurável por cliente
Adicionar um campo `public_base_url` em `clients` (fallback opcional para casos com domínio próprio). Regra de escolha da URL usada nos disparos, em ordem:

1. `client.public_base_url` (se preenchido e https)
2. URL publicada do projeto (`<slug>.lovable.app`) quando detectada
3. `window.location.origin` (fallback com aviso)

Ajustar:
- `src/pages/Disparos.tsx` → `handleUseMissions` e o bloco de split por grupo em `handleSend` passam a usar `resolvePublicBaseUrl(client)` em vez de `window.location.origin`.
- Novo helper `src/lib/public-base-url.ts` centraliza a lógica.

### Passo 3 — Aviso visível quando a base é preview
Na aba **Missões IA** e no editor de mensagem em **Disparos**, mostrar um alerta amarelo quando a base resolvida ainda for `*.lovableproject.com` / `id-preview--*.lovable.app`, com texto claro: "Publique o projeto ou configure a URL pública para que os destinatários consigam abrir o link." Bloquear o botão "Usar missões" nesse estado (com tooltip explicativo) para não gerar mais campanha com link quebrado.

### Passo 4 — Campo de configuração
Em `Settings` (card do cliente), adicionar input "URL pública" com validação https e teste "Abrir" que faz `HEAD` e mostra status. Persiste em `clients.public_base_url`.

### Passo 5 — Higiene de meta e fallback
- `MissaoPublica.tsx`: garantir `<title>` e `og:*` próprios (aparece bonito na prévia do WhatsApp quando publicado).
- Se `code=invalid` chegar via query, mostrar mensagem amigável "Este link expirou ou foi digitado errado" em vez de deixar o estado padrão.

## Fora de escopo
- Não vou mexer no fluxo de rastreamento em si (`/api/public/m/...` continua igual — já é público).
- Não vou trocar a rota `/missao/:missionId` para TanStack Start; o gate é do preview, não da rota — publicar resolve.

## Detalhes técnicos

- Migration:
  ```sql
  alter table public.clients
    add column if not exists public_base_url text;
  ```
  Sem grants/policies adicionais — já lidos pelo mesmo perfil autenticado.

- `resolvePublicBaseUrl(client)`:
  - Normaliza (remove barra final, força https).
  - Detecta preview por regex `/(lovableproject\.com|id-preview--.*\.lovable\.app)$/i` → sinaliza `isPreview: true`.
  - Retorna `{ url, isPreview }`.

- Onde já usamos hoje `window.location.origin` (grep confirma dois pontos): `handleUseMissions` e o bloco `shouldSplitForGroupTracking` em `handleSend`. Ambos passam a chamar o helper.

## Riscos
- Se o usuário configurar uma URL pública errada, os links quebram silenciosamente. Mitigação: teste "Abrir" no Settings + aviso quando `HEAD` retornar 3xx para `auth-bridge`.
- Publicar troca o domínio; disparos antigos que já saíram continuam apontando para preview. Não há como consertar mensagens já entregues — só as próximas.
