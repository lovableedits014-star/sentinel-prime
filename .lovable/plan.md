
## Objetivo

1. Deixar os materiais de campanha **muito mais visíveis** na página pública do apoiador (`/g/:clientSlug` e `/foto/:clientId`), com prévia de destaque sem precisar clicar em aba.
2. Corrigir o problema do **celular do usuário não exibir a aba de Materiais** (provável cache do Service Worker / aba renderizada só sob `TabsContent` que depende de JS).
3. Adicionar a mesma seção de **materiais para download** dentro do **Portal do Coordenador** (`/portal/coordenador/...`), idêntica à pública.

---

## 1. Materiais em evidência na página pública

Hoje os materiais ficam escondidos atrás da aba "Materiais" (em `GaleriaPublica`) ou no fim da página (em `FotoPublica`). Mudanças:

**Novo componente `MateriaisDestaque` (`src/components/campaign-materials/MateriaisDestaque.tsx`)**
- Recebe `clientId`, `clientName`, `limit=3`.
- Busca os 3 primeiros materiais publicados (ordenados por `order_index`).
- Mostra cards grandes em grid (1 col mobile, 3 col desktop) com thumbnail + título + botões **Baixar** e **WhatsApp** (mesma lógica do `PublicMaterialsTab`).
- Embaixo, um botão grande **"Ver todos os N materiais"** que:
  - Em `GaleriaPublica`: troca para a aba `materiais` e rola até lá.
  - Em `FotoPublica`: rola até a lista completa.
- Renderiza nada se não houver materiais publicados.

**Em `GaleriaPublica.tsx`**
- Inserir `<MateriaisDestaque>` logo **após o gerador de foto** e **antes do CTA atual** (que vira opcional / removido para reduzir ruído).
- Manter a aba "Materiais" para a listagem completa com busca/filtros.

**Em `FotoPublica.tsx`**
- Inserir `<MateriaisDestaque>` logo após `CampaignFrameGenerator`, antes do botão "Baixe N materiais".
- Manter a seção completa abaixo (`PublicMaterialsTab`).

**Refator pequeno em `PublicMaterialsTab.tsx`**
- Extrair o card individual em um sub-componente `MaterialCard` exportado, para `MateriaisDestaque` reaproveitar exatamente o mesmo visual e lógica de download/WhatsApp (sem duplicação).

---

## 2. Aba "Materiais" sumindo no celular do usuário

Causa provável: **Service Worker em cache** (`public/sw.js`) servindo a versão antiga da página, mais o fato de o conteúdo da aba só aparecer após o JS hidratar e o usuário tocar — em telas pequenas com problema de cache, o conteúdo nunca aparece.

Ações:

- **Tornar os materiais visíveis sem depender da aba** (item 1 já resolve em grande parte — `MateriaisDestaque` aparece direto, sem clique).
- **Forçar atualização do SW**: revisar `public/sw.js` para garantir versão (`CACHE_NAME = 'v…'` com bump) e que a navegação HTML use `network-first` (não `cache-first`), evitando servir HTML antigo. Se já for assim, apenas bumpar a versão para invalidar.
- **No layout da `GaleriaPublica`**: trocar `TabsList grid-cols-2 max-w-md` para `w-full` real em mobile e garantir que a aba "Materiais" continue clicável (botão grande com badge vermelho do total) — já está, mas reforçar `min-h-11` para toque.
- **Botão flutuante mobile**: adicionar um pequeno FAB (`fixed bottom-4 right-4 sm:hidden`) "📥 Materiais (N)" que rola até a seção, garantindo que mesmo se a aba não for percebida, exista um atalho permanente.

---

## 3. Materiais no Portal do Coordenador

Hoje `PortalCoordenador.tsx` já tem `clientId` resolvido e usa `CampaignFrameGenerator`. Falta a seção de materiais.

- Adicionar um novo bloco/cartão **"Material de campanha"** próximo do bloco de foto/moldura, contendo:
  - `<MateriaisDestaque clientId={clientId} clientName={candidatoNome} limit={3} />`
  - Botão "Ver todos" que abre um `Dialog` em tela cheia (mobile-friendly) com `<PublicMaterialsTab clientId={clientId} clientName={candidatoNome} />` dentro — assim o coordenador baixa exatamente igual ao apoiador público, sem sair da página.
- Reaproveita os componentes existentes (`MateriaisDestaque` + `PublicMaterialsTab`), sem duplicar lógica nem alterar políticas RLS (a tabela `campaign_materials` com `status='published'` já é pública).

---

## Detalhes técnicos

- **Arquivos novos**: `src/components/campaign-materials/MateriaisDestaque.tsx`.
- **Arquivos editados**:
  - `src/components/campaign-materials/PublicMaterialsTab.tsx` (extrair `MaterialCard` exportado).
  - `src/pages/GaleriaPublica.tsx` (incluir destaque + FAB mobile).
  - `src/pages/FotoPublica.tsx` (incluir destaque).
  - `src/pages/PortalCoordenador.tsx` (novo bloco "Material de campanha" + Dialog "Ver todos").
  - `public/sw.js` (bump de versão de cache + network-first em HTML, se ainda não estiver).
- **Sem mudanças** em banco, RLS, edge functions ou tipos.
- **Validação**: abrir `/g/<slug>`, `/foto/<id>` e `/portal/coordenador/...` em desktop e mobile; conferir que os 3 cards aparecem sem clique, botões de download e WhatsApp funcionam, e que o FAB mobile rola até a seção completa.
