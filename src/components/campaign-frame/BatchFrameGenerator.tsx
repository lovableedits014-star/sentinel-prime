import { useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Upload, Download, Trash2, RefreshCw, Loader2, FileImage } from "lucide-react";
import { toast } from "sonner";
import { FrameComposition } from "./types";
import { useBatchRenderer, BATCH_MAX, BATCH_MAX_FILE_MB } from "./useBatchRenderer";
import BatchPhotoCard from "./BatchPhotoCard";

interface Props {
  composition: FrameComposition | null;
  frameName?: string;
  /** Optional external batch (lets a parent share/publish the same items). */
  batch?: ReturnType<typeof useBatchRenderer>;
}

export default function BatchFrameGenerator({ composition, frameName, batch: externalBatch }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const internalBatch = useBatchRenderer(composition);
  const batch = externalBatch ?? internalBatch;

  const onPick = useCallback(async (files: FileList | null) => {
    if (!files || !files.length) return;
    if (!composition) {
      toast.error("Selecione uma moldura primeiro");
      return;
    }
    const arr = Array.from(files);
    const oversize = arr.filter((f) => f.size > BATCH_MAX_FILE_MB * 1024 * 1024);
    const nonImage = arr.filter((f) => !f.type.startsWith("image/"));
    if (oversize.length) toast.warning(`${oversize.length} arquivo(s) ignorado(s) (>${BATCH_MAX_FILE_MB}MB)`);
    if (nonImage.length) toast.warning(`${nonImage.length} arquivo(s) ignorado(s) (não é imagem)`);
    const remaining = BATCH_MAX - batch.items.length;
    if (arr.length > remaining) toast.warning(`Apenas ${remaining} foto(s) serão processadas (limite ${BATCH_MAX})`);
    await batch.addFiles(arr);
    toast.success(`Fotos processadas`);
  }, [batch, composition]);

  const onAdjust = useCallback(async (id: string, patch: any) => {
    await batch.rerenderItemWith(id, patch);
  }, [batch]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border-2 border-dashed p-6 text-center bg-muted/30">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => { onPick(e.target.files); e.target.value = ""; }}
        />
        <FileImage className="w-10 h-10 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm font-medium">Envie várias fotos de uma vez</p>
        <p className="text-xs text-muted-foreground mb-3">
          Moldura: <span className="font-medium">{frameName ?? "—"}</span> · até {BATCH_MAX} fotos · máx {BATCH_MAX_FILE_MB}MB cada
        </p>
        <Button
          onClick={() => inputRef.current?.click()}
          disabled={!composition || batch.items.length >= BATCH_MAX}
          className="gap-2"
        >
          <Upload className="w-4 h-4" /> Selecionar fotos ({batch.items.length}/{BATCH_MAX})
        </Button>
      </div>

      {batch.progress && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Processando {batch.progress.done} de {batch.progress.total}…
        </div>
      )}

      {batch.items.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2 items-center justify-between border rounded-md p-2 bg-card">
            <Label className="text-xs px-1">
              {batch.items.filter((i) => i.status === "ready").length} prontas · {batch.items.length} total
            </Label>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={batch.rerenderAll} disabled={!!batch.progress}>
                <RefreshCw className="w-3.5 h-3.5" /> Reaplicar moldura
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 text-destructive" onClick={batch.clearAll}>
                <Trash2 className="w-3.5 h-3.5" /> Limpar lote
              </Button>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={batch.downloadZip}
                disabled={batch.items.every((i) => i.status !== "ready")}
              >
                <Download className="w-3.5 h-3.5" /> Baixar todas (ZIP)
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {batch.items.map((it, idx) => (
              <BatchPhotoCard
                key={it.id}
                item={it}
                index={idx}
                onAdjust={onAdjust}
                onRemove={batch.removeItem}
                onDownload={batch.downloadOne}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
