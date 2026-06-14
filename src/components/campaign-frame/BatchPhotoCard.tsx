import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Download, Loader2, Pencil, Trash2, AlertCircle, CheckCircle2 } from "lucide-react";
import type { BatchItem } from "./useBatchRenderer";

interface Props {
  item: BatchItem;
  index: number;
  onAdjust: (id: string, patch: Partial<BatchItem>) => void;
  onRemove: (id: string) => void;
  onDownload: (id: string) => void;
}

export default function BatchPhotoCard({ item, index, onAdjust, onRemove, onDownload }: Props) {
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(item.zoom);
  const [offset, setOffset] = useState(item.offset);
  const [dragging, setDragging] = useState(false);
  const [start, setStart] = useState({ x: 0, y: 0 });

  const apply = () => {
    onAdjust(item.id, { zoom, offset });
    setOpen(false);
  };

  return (
    <div className="border rounded-lg overflow-hidden bg-card flex flex-col">
      <div className="relative aspect-square bg-muted">
        {item.status === "ready" && item.resultUrl ? (
          <img src={item.resultUrl} alt={item.fileName} className="w-full h-full object-cover" />
        ) : item.status === "error" ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-destructive p-2 text-center">
            <AlertCircle className="w-6 h-6 mb-1" />
            <p className="text-[10px]">{item.error ?? "Erro"}</p>
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}
        <span className="absolute top-1 left-1 bg-background/80 backdrop-blur rounded px-1.5 py-0.5 text-[10px] font-medium">
          #{index + 1}
        </span>
        {item.status === "ready" && (
          <CheckCircle2 className="absolute top-1 right-1 w-4 h-4 text-emerald-500 bg-background rounded-full" />
        )}
      </div>
      <div className="p-2 space-y-1.5">
        <p className="text-[11px] truncate" title={item.fileName}>{item.fileName}</p>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-7 px-2 gap-1 text-[11px]"
            disabled={item.status !== "ready"}
            onClick={() => { setZoom(item.zoom); setOffset(item.offset); setOpen(true); }}
          >
            <Pencil className="w-3 h-3" /> Ajustar
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2"
            disabled={item.status !== "ready"}
            onClick={() => onDownload(item.id)}
            title="Baixar"
          >
            <Download className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-destructive"
            onClick={() => onRemove(item.id)}
            title="Remover"
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="truncate">Ajustar: {item.fileName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div
              className="aspect-square bg-muted rounded-lg overflow-hidden border touch-none select-none cursor-move relative"
              onPointerDown={(e) => {
                setDragging(true);
                setStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (!dragging) return;
                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                const ratio = 1080 / rect.width;
                setOffset({ x: (e.clientX - start.x) * ratio, y: (e.clientY - start.y) * ratio });
              }}
              onPointerUp={() => setDragging(false)}
              onPointerCancel={() => setDragging(false)}
            >
              {item.resultUrl && (
                <img src={item.resultUrl} alt="preview" className="w-full h-full object-cover pointer-events-none opacity-60" />
              )}
              <div className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground pointer-events-none">
                arraste para reposicionar
              </div>
            </div>
            <div>
              <Label className="text-xs">Zoom ({zoom.toFixed(2)}x)</Label>
              <Slider value={[zoom]} min={0.5} max={3} step={0.05} onValueChange={(v) => setZoom(v[0])} />
            </div>
            <div className="flex justify-between gap-2">
              <Button variant="outline" size="sm" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }}>
                Resetar
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button size="sm" onClick={apply}>Aplicar</Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
