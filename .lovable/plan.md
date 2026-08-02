# Subir fotos sem moldura na galeria

Hoje, dentro de **Fotos de Campanha → Galerias públicas**, toda foto passa obrigatoriamente pelo gerador de moldura antes de ser publicada. A mudança acrescenta um segundo caminho: enviar os arquivos como estão (já editados manualmente por você) direto para a galeria.

## Como vai funcionar

Ao abrir uma galeria, a área "Adicionar novas fotos" passa a ter duas abas:

1. **Com moldura** — exatamente o fluxo atual (lote + moldura da galeria + publicar).
2. **Sem moldura (arquivos prontos)** — seleciona/arrasta os arquivos, vê as miniaturas, remove o que não quiser e clica em publicar. As imagens sobem sem nenhuma alteração de arte.

Detalhes do caminho "sem moldura":
- Aceita JPG, PNG e WebP; múltiplos arquivos por vez.
- Mostra progresso ("3 de 12 enviadas") e avisa quais falharam, sem interromper as demais.
- As fotos entram na mesma galeria, misturadas às com moldura, na ordem em que foram enviadas (após as já existentes).
- Se a galeria ainda não tem capa, a primeira foto enviada se torna a capa; a galeria é marcada como publicada, igual ao fluxo atual.
- A remoção de foto já publicada continua funcionando do mesmo jeito para os dois tipos.

Nada do fluxo atual com moldura é alterado nem removido.

## Detalhes técnicos

- `src/components/campaign-frame/useGalleryUpload.ts`: nova função `publishRawFilesToGallery({ clientId, galleryId, files, startIndex, onProgress })` — reaproveita o mesmo bucket `campaign-frame-assets`, o mesmo padrão de caminho `clientId/gallery/galleryId/<uuid>.<ext>` e o mesmo insert em `campaign_photo_gallery_items` usado hoje. Sem mudança de schema e sem migração.
- Novo componente `src/components/campaign-frame/RawPhotoUploader.tsx`: input de arquivos, grade de miniaturas com remover, estado de progresso e callback de conclusão.
- `src/components/campaign-frame/GalleryManager.tsx` (`GalleryWorkspaceDialog`): envolve a seção de adicionar fotos em `Tabs` com as duas opções; o handler de publicar sem moldura chama `publishRawFilesToGallery` com `startIndex = existingItems.length`, aplica capa/status como no `handlePublish` atual e recarrega a lista.
- `order_index` continua sequencial dentro da galeria para preservar a ordenação da página pública (`GaleriaEvento` / `GaleriaPublica`).
