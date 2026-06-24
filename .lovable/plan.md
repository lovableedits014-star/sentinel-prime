## Objetivo

Corrigir downloads no iPhone, especialmente quando o usuário abre pelo WhatsApp/WA Business, para que imagens, materiais de campanha e ZIPs tenham um caminho funcional de salvar/compartilhar.

## Problema identificado

O app usa em vários lugares este padrão:

```ts
const a = document.createElement("a")
a.href = blobUrlOuDataUrl
a.download = filename
a.click()
```

Esse padrão funciona em desktop e Android, mas é inconsistente no iPhone. No Safari iOS e nos navegadores internos do WhatsApp/Instagram/Facebook, o atributo `download` costuma ser ignorado, principalmente para `blob:` e `data:` URLs. Resultado: o usuário toca em "Baixar" e nada acontece, ou o iPhone apenas mostra uma tela de confirmação sem salvar corretamente.

## Solução

Criar um helper único para download compatível com iPhone e trocar os pontos críticos para usá-lo.

### 1. Criar `src/lib/mobile-download.ts`

Funções principais:

- `saveBlob(blob, filename, options?)`
- `saveUrl(url, filename, options?)`
- `saveDataUrl(dataUrl, filename, options?)`

Comportamento:

1. Se o aparelho suportar `navigator.share({ files })`, usar Web Share API com um `File`. No iPhone isso abre a tela nativa com opções como salvar em Fotos, salvar em Arquivos, enviar pelo WhatsApp etc.
2. Se for iPhone/iPad e não suportar compartilhamento de arquivo, abrir o arquivo em nova aba e mostrar toast com instrução curta: "No iPhone, toque em Compartilhar ou pressione a imagem para salvar."
3. Em desktop/Android, manter o `<a download>` atual.
4. Em caso de erro, cair para `window.open(url, "_blank")` quando houver URL pública.

### 2. Foto de apoiador com moldura

Alterar:

- `src/components/campaign-frame/FrameEditor.tsx`
- `src/components/campaign-frame/useBatchRenderer.ts`

Cobrir:

- Download individual da foto gerada.
- Download de cada item do lote.
- Download do ZIP do lote.

A foto gerada hoje usa `canvas.toDataURL`; no novo fluxo vamos converter para `Blob/File` antes de chamar o helper, porque iPhone lida melhor com arquivo real do que com `data:` URL.

### 3. Galeria pública de eventos/fotos

Alterar:

- `src/pages/GaleriaEvento.tsx`

Cobrir:

- Download individual de foto do evento.
- Download de todas em ZIP.

O fluxo continuará buscando a imagem/ZIP, mas a etapa final passará pelo helper compatível com iPhone.

### 4. Materiais públicos de campanha

Alterar:

- `src/components/campaign-materials/PublicMaterialsTab.tsx`
- `src/components/campaign-materials/MateriaisDestaque.tsx`

Cobrir:

- Botão "Baixar" da página pública de materiais.
- Botão "Baixar" dos materiais em destaque na página pública.

Tipos cobertos:

- Imagem: usar compartilhamento nativo no iPhone ou abrir com instrução para salvar.
- PDF: usar compartilhamento nativo/Arquivos no iPhone.
- Vídeo: usar compartilhamento nativo quando suportado; fallback para abrir o arquivo.

Manter o contador de downloads como está.

### 5. Downloads administrativos/relatórios

Não vou mexer em tudo que é relatório interno agora, para evitar risco em áreas não relatadas. Mas vou trocar os helpers reutilizáveis quando forem diretamente usados por fluxos relacionados ao problema, como ZIP de contratos se aparecer conectado ao mesmo helper.

## Resultado esperado

- No iPhone, ao tocar em "Baixar", o usuário verá a tela nativa de compartilhamento/salvamento quando possível.
- Quando o navegador interno do WhatsApp bloquear download direto, o app abrirá o arquivo e mostrará orientação clara para salvar.
- Desktop e Android continuam funcionando como antes.
- A correção fica centralizada para reutilizar em qualquer novo botão de download no app.