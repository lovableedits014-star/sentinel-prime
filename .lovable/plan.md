## Objetivo
Adicionar uma aba **"Geração em lote"** ao sistema de molduras: o usuário escolhe uma moldura, sobe várias fotos de uma vez (ex.: 20–30), e o sistema gera automaticamente todas as versões com a moldura aplicada. Depois, em uma grade, ele pode ajustar **zoom e posição** de cada foto individualmente antes de baixar tudo (uma a uma ou em ZIP).

## Fluxo do usuário
1. Abre o gerador de fotos → nova aba **"Lote"** ao lado de "Individual".
2. Seleciona a moldura desejada.
3. Arrasta ou seleciona múltiplas fotos (até 30 por vez; cada uma até ~10MB; JPG/PNG/HEIC).
4. O sistema processa todas em paralelo (Web Worker / fila) com auto-centralização inteligente da face/centro da imagem.
5. Exibe uma **grade de miniaturas** com o resultado de cada foto. Cada miniatura mostra:
   - Preview com a moldura aplicada
   - Ícone de status (ok / erro / processando)
   - Botão "Ajustar" → abre editor rápido (zoom + arrastar) só daquela foto
   - Botão "Baixar"
   - Botão "Remover"
6. Botões globais no topo:
   - **"Baixar todas (ZIP)"** — empacota todos os PNGs gerados
   - **"Reaplicar a todas"** — caso troque de moldura no meio
   - **"Limpar lote"**

## Mudanças técnicas

### Novos arquivos
- `src/components/campaign-frame/BatchFrameGenerator.tsx` — UI principal do lote (upload, grade, controles globais).
- `src/components/campaign-frame/BatchPhotoCard.tsx` — miniatura individual com mini-editor (zoom/offset) num popover ou dialog leve.
- `src/components/campaign-frame/useBatchRenderer.ts` — hook que mantém o estado `BatchItem[]` e expõe `addFiles`, `updateItem`, `renderItem`, `renderAll`, `downloadZip`.

### Alteração
- `src/components/campaign-frame/CampaignFrameGenerator.tsx`: envolver conteúdo do dialog em `<Tabs>` com `"Individual"` (atual) e `"Lote"` (novo `<BatchFrameGenerator />`). Reusar `frames`, `selectedFrame`, helpers `preloadComposition` / `renderComposition` já existentes.

### Tipos
```ts
interface BatchItem {
  id: string;
  fileName: string;
  originalUrl: string;        // objectURL da foto enviada
  image: HTMLImageElement | null;
  zoom: number;               // default 1
  offset: { x: number; y: number };
  status: "queued" | "ready" | "error";
  error?: string;
  resultBlob?: Blob;           // PNG final
  resultUrl?: string;          // objectURL do PNG
}
```

### Renderização
- Reutiliza `renderComposition()` num `OffscreenCanvas` (fallback: `<canvas>` invisível) de 1080×1080.
- Pipeline por item: ler arquivo → `createImageBitmap` → render → `canvas.toBlob('image/png')` → guardar em `resultBlob`.
- Processamento em paralelo limitado (concorrência = 3) para não travar o navegador.
- Quando o usuário muda zoom/offset numa miniatura, só aquele item é re-renderizado.

### Auto-centralização (melhoria)
- Por padrão, a foto entra com `zoom=1` e centralizada (igual ao individual).
- **Opcional, simples e sem custo**: detectar borda transparente / proporção e centralizar pelo maior eixo. (Detecção de face fica fora do escopo desta entrega para evitar dependências pesadas — pode ser uma melhoria futura via API.)

### Download em lote
- Adicionar dependência `jszip` (leve, ~95KB, funciona no browser).
- Botão **"Baixar todas (ZIP)"** gera `campanha-fotos-{timestamp}.zip` com arquivos `foto-01.png … foto-NN.png` (preserva nome original quando possível).

### Limites e UX
- Limite recomendado: **30 fotos por lote** (configurável via constante). Acima disso, avisar e cortar.
- Tamanho máximo por foto: 10MB. Validação no input.
- Indicador de progresso global: `"Processando 7 de 24..."`.
- Erros por foto não interrompem o lote (ex.: arquivo corrompido vira card com status "erro" e botão remover).

## Fora do escopo (sugestões para depois)
- Detecção automática de face (precisaria de modelo ML no browser ou API).
- Salvar lote no Supabase para continuar depois.
- Aplicar molduras diferentes para fotos diferentes no mesmo lote.

## Resumo de arquivos
- **Criar**: `BatchFrameGenerator.tsx`, `BatchPhotoCard.tsx`, `useBatchRenderer.ts`
- **Editar**: `CampaignFrameGenerator.tsx` (adicionar Tabs)
- **Dependência nova**: `jszip`
