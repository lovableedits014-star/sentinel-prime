## Objetivo

Deixar a aba **Tráfego Pago** enxuta — só o que o **sistema** precisa para funcionar (conectar na Meta, ler conta, sincronizar campanhas e métricas). Tudo que é responsabilidade do anunciante na Meta (CNPJ eleitoral, disclaimer "Pago por…", identidade política, dados do candidato, banners do TSE) sai da tela e do checklist. Além disso, corrigir o diagnóstico de permissões, que hoje dá "faltando" mesmo quando o token funciona.

## O que muda na tela (`src/pages/TrafegoPago.tsx`)

1. **Remover da UI**:
   - Banner "Período pré-eleitoral / faltam X dias".
   - Trava `periodoLiberado` no botão "Nova campanha" (deixa sempre disponível, o Guard da Meta cuida do resto).
   - Aba/seção de "CNPJ eleitoral", "Disclaimer Pago por…", "Confirmação de identidade política", "Nome/Número/Cargo do candidato" no `AccountForm`.
   - Itens do checklist: `disclaimer_configured`, `cnpj_eleitoral_set`, `political_identity_confirmed`.

2. **AccountForm fica com apenas**:
   - **ID da conta de anúncio Meta** (`act_XXXXXXXX`) — único campo obrigatório.
   - Botão **Salvar**.
   - Texto curto explicando onde achar o ID.

3. **Checklist reduzido ao essencial p/ a integração funcionar**:
   - Token Meta presente e válido.
   - Permissão `ads_management` **ou** `ads_read` (qualquer uma já permite leitura/sincronização).
   - Permissão `business_management` (necessária para listar contas via BM).
   - `pages_manage_ads` + `leads_retrieval` viram **opcionais/avisos** (só travam se o cliente for usar campanha de Leads).
   - Conta de anúncio acessível pelo token (chamada real ao endpoint `/{act_id}`).
   - Conta de anúncio com `account_status = 1` (ativa).
   - Pixel: vira **info**, não bloqueia.

4. **Status geral**: `ok` se token + 1 permissão de ads + conta acessível e ativa. Removidos blocos eleitorais do cálculo.

## O que muda no diagnóstico (`supabase/functions/ads-meta-diagnostic/index.ts`)

Problema atual: o checklist marca permissões como ausentes mesmo quando funcionam. Causas comuns:
- **System User Tokens** não retornam dados em `/me/permissions` (esse endpoint é para tokens de usuário). O código atual marca tudo como `false` nesse caso.
- O endpoint pode responder OK mas só listar um subset; a verdade prática é se as chamadas funcionam.

**Correções**:
1. Tentar `/me/permissions` como hoje. Se vier vazio **ou** der erro de tipo de token, cair para **verificação funcional**:
   - `GET /me?fields=id,name` → token vivo.
   - `GET /me/businesses` → confirma `business_management`.
   - `GET /{adAccountId}?fields=account_status,name,business` → confirma `ads_read`/acesso.
   - `GET /{adAccountId}/campaigns?limit=1` → confirma leitura.
   - `GET /{adAccountId}/adspixels?limit=1` → pixel (info).
   Cada chamada bem-sucedida marca a flag correspondente como `true`, mesmo sem aparecer em `/me/permissions`.
2. Reduzir `REQUIRED_ADS_PERMS` para `['ads_read','business_management']` como bloqueantes; resto vira warn/info.
3. Parar de gerar issues `block` para `cnpj_eleitoral`, `disclaimer`, `candidato_*`, `identidade_meta`. Esses campos ainda podem existir no DB mas o diagnóstico ignora.
4. `overall_status`:
   - `ok` = sem `block` na lista reduzida.
   - `warning` = só `warn`/`info`.
   - `blocked` = qualquer `block` (token inválido, conta inacessível, conta inativa).

## O que NÃO muda

- Esquema do banco (`ads_accounts`, `ads_identity_status`) fica como está — só deixamos de exibir/cobrar os campos eleitorais. Sem migração.
- `ads-sync-campaigns`, `ads-create-campaign`, `ads-guard-check`, wizard de criação e IA Estrategista permanecem.
- Botão **Sincronizar campanhas** continua igual.

## Resultado esperado

- Tela limpa: cadastra `act_XXXX`, roda diagnóstico, vê os 4-5 itens que importam, sincroniza, vê métricas.
- Quem já tem permissão na Meta passa a aparecer como ✓ porque o diagnóstico valida via chamada real à API, não só via `/me/permissions`.
- Toda burocracia eleitoral (CNPJ, disclaimer, identidade política, datas do TSE) sai da plataforma — o usuário trata 100% disso dentro do Gerenciador da Meta.
