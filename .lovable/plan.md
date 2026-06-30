## Objetivo
Tornar a página **Tráfego Pago** plug-and-play: nada de digitar `act_XXX`, nada de configurar token aqui. O sistema lê o **token Meta já conectado** em `integrations.meta_access_token` (mesmo token usado pelo módulo de Comentários), descobre sozinho as contas de anúncio disponíveis, conecta automaticamente e puxa as campanhas.

## O que muda

### 1. Edge Function `ads-meta-diagnostic` (reformulada — autoconnect)
Hoje ela só valida uma conta já cadastrada. Vai passar a:
- Ler `integrations.meta_access_token` do cliente ativo.
- Chamar `GET /me/adaccounts?fields=id,name,account_status,business,currency,disable_reason` para **descobrir** todas as contas que o token enxerga.
- Se não houver registro em `ads_accounts`, **gravar automaticamente** todas as contas ativas encontradas (a primeira ativa vira `ativa=true`).
- Se já houver `ads_accounts`, atualizar nome/status/moeda e marcar contas perdidas como `ativa=false`.
- Validar funcionalmente: token vivo (`/me`), `business_management` (`/me/businesses`), `ads_read` (lê uma campanha), pixel (`/adspixels`).
- Persistir em `ads_identity_status` com `available_accounts` no `raw_response` para a UI listar.
- Remover qualquer issue do tipo "no_token" pedindo configuração manual — em vez disso, instruir o usuário a conectar Meta no módulo de Comentários (link direto).

### 2. Nova Edge Function `ads-switch-account`
Recebe `{ clientId, metaAdAccountId }`, marca a conta escolhida como `ativa=true` e as demais do mesmo cliente como `ativa=false`. Usada quando o usuário tem várias contas e quer trocar.

### 3. `ads-sync-campaigns` (pequeno ajuste)
- Se não houver `ads_accounts` ativa, dispara o diagnóstico antes (auto-descoberta) e tenta de novo.
- Mantém o resto igual.

### 4. Página `src/pages/TrafegoPago.tsx` (reformulada)
- **Autoconnect on mount**: ao montar com `clientId` válido, se não há `ads_identity_status` recente (ou não há `ads_accounts`), dispara `ads-meta-diagnostic` automaticamente e, em seguida, `ads-sync-campaigns` quando uma conta ficar ativa. Toast discreto "Conectando à Meta…".
- **Remove** o formulário `AccountForm` (digitar `act_XXX`), o dialog "Cadastrar conta" e a aba "Conta".
- **Nova aba "Conta Meta"** mostra:
  - Quais contas o token enxerga (cards com nome, ID, moeda, status).
  - Botão "Usar esta conta" em cada uma (chama `ads-switch-account` e re-sincroniza).
  - Aviso curto com link para `/configuracoes` caso `meta_access_token` esteja ausente — em vez de um formulário.
- **Header**: o `StatusOverview` deixa de oferecer "Cadastrar conta" e passa a refletir o auto-status (Conectando / Conectado / Sem token Meta).
- **Aba Conexão**: o checklist vira leitura pura do diagnóstico. Remove instruções de cadastrar `act_`.
- Mantém Dashboard, Campanhas, IA Estrategista intactos.

### 5. Testes (via `supabase--curl_edge_functions`)
Depois do deploy, com o usuário logado:
1. `POST /ads-meta-diagnostic { clientId }` → confere `success:true`, `status.overall_status` e que `ads_accounts` recebeu as contas descobertas.
2. `POST /ads-switch-account` em uma segunda conta (se houver) → confere flip de `ativa`.
3. `POST /ads-sync-campaigns { clientId, daysBack:30 }` → confere `counts.campaigns >= 0` e `counts.insights >= 0` sem erro 400.
4. Validar no preview: abrir `/trafego-pago` zerado, ver auto-conexão concluir e dashboard popular sem nenhuma ação manual.

## Tabelas / migrações
Nenhuma migração nova — `ads_accounts` e `ads_identity_status` já têm os campos necessários (uso `raw_response` jsonb para guardar a lista de contas descobertas).

## Detalhes técnicos
- Toda a leitura de `meta_access_token` continua server-side (edge function com service role) — o front nunca vê o token.
- Normalização do ID continua: API exige prefixo `act_`.
- Autoconnect roda no máximo uma vez por carga; após sucesso, salva timestamp em `ads_identity_status` e a página decide pelo `checked_at` (>10min revalida).
- Erros do tipo "token sem permissão de ads" geram issue informativa apontando para o Business Manager, não para configuração local.

## Fora de escopo
- Nenhuma mudança em CNPJ eleitoral / disclaimer / identidade política (segue tratado direto na Meta, como já está).
- Sem mudanças no Wizard de criação nem na IA Estrategista.
