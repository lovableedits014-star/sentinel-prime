## Problema

Hoje, ao clicar em **"Baixar"** na foto montada do perfil (frame de campanha), o sistema chama `saveDataUrl` / `saveBlob` do helper `src/lib/mobile-download.ts`. Esse helper foi feito priorizando a **Web Share API** — então no iPhone (e em alguns Androids modernos) abre a folha de compartilhamento em vez de baixar direto. Para usuários leigos isso confunde: eles esperam que "Baixar" baixe.

O mesmo helper é usado em outros lugares (galeria de eventos, materiais, exportar VCF do iOS, etc.) onde **compartilhar faz sentido**. Então não dá pra simplesmente desligar Web Share globalmente — precisa ser uma opção por chamada.

## Correção

### 1. Adicionar modo "download direto" no helper `src/lib/mobile-download.ts`

Incluir uma flag `preferDownload?: boolean` em `SaveOptions`. Quando `true`:

- **Android / Desktop**: usa `<a download>` clássico (já é o comportamento atual no fallback).
- **iPhone (Safari iOS 13+)**: usa `<a download>` apontando para um `blob:` URL. O Safari moderno respeita o atributo `download` para blobs same-origin e salva direto em **Arquivos → Downloads** sem abrir folha de compartilhamento. Funciona pra imagem JPG/PNG.
- **WebView de in-app browser (Instagram/WhatsApp)**: aí sim mostra um toast curto avisando "Abra no Safari/Chrome para baixar", porque WebViews bloqueiam download de blob. Sem cair em Web Share.
- Não chamar `navigator.share` em nenhum caminho quando `preferDownload` estiver ligado.

O comportamento atual (Share-first) continua sendo o **default** para os outros usos que dependem dele.

### 2. Ligar o modo nos pontos do frame de campanha

Passar `{ preferDownload: true }` nas chamadas:

- `src/components/campaign-frame/FrameEditor.tsx` linha 161 — `saveDataUrl(resultUrl, ..., { preferDownload: true })`
- `src/components/campaign-frame/useBatchRenderer.ts` linhas 187 e 197 — `saveBlob(..., { preferDownload: true })` no ZIP e em cada foto individual baixada do lote.

Esses são os fluxos do "monte sua foto de perfil" e "baixar todas".

### 3. Pequeno ajuste de UX

- Manter o texto do botão como **"Baixar PNG (1080x1080)"** no `FrameEditor.tsx` (sem mudança).
- Remover a frase "Clique em Baixar e depois compartilhe…" de `src/pages/FotoPublica.tsx` linha 125 e trocar por algo mais direto tipo: *"Toque em Baixar para salvar a foto no seu celular. No iPhone, ela vai pra Arquivos → Downloads."* Isso reduz a confusão pra usuário leigo.

### 4. Não mexer (importante)

- `GaleriaEvento.tsx`, materiais da campanha, e o fluxo de **VCF iOS** continuam usando o comportamento atual (Web Share habilitado) — ali compartilhar é desejado (salvar em Contatos, mandar pro WhatsApp etc.).

## Testes manuais sugeridos

1. iPhone Safari → abrir página pública, montar foto, tocar **Baixar** → arquivo cai direto em Arquivos/Downloads, sem folha de compartilhamento.
2. Android Chrome → mesmo fluxo, baixa direto para Downloads.
3. iPhone dentro do Instagram (WebView) → toast pedindo abrir no Safari (não tenta share).
4. Desktop → baixa direto, sem mudança.
5. Galeria de evento e materiais → continuam abrindo a folha de compartilhar normalmente (sem regressão).
