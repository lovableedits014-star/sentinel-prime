import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Loader2, Send, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { publishRawFilesToGallery } from "./useGalleryUpload";

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif";
const MAX_FILE_MB = 25;

interface Props {
  clientId: string;
  galleryId: string;
  startIndex: number;
  watermarkLogo?: string;
  logoSettings?: any;
  onPublished: (info: { uploaded: number; firstUrl: string | null }) => void;
  description?: string;
  buttonLabel?: string;
}

interface Pending {
  id: string;
  file: File;
  previewUrl: string;
}

export default function RawPhotoUploader({ 
  clientId, 
  galleryId, 
  startIndex, 
  watermarkLogo, 
  logoSettings, 
  onPublished,
  description,
  buttonLabel
}: Props) {
  const [pending, setPending] = useState<Pending[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      pending.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const accepted: Pending[] = [];
    let rejected = 0;
    const fileArr = Array.from(files);

    for (let i = 0; i < fileArr.length; i++) {
      let file = fileArr[i];
      const isHEIC = /\.(heic|heif)$/i.test(file.name) || file.type === "image/heic" || file.type === "image/heif";
      const okType = /^image\/(jpeg|jpg|png|webp|heic|heif)$/i.test(file.type) || isHEIC;
      const okSize = file.size <= MAX_FILE_MB * 1024 * 1024;
      
      if (!okType || !okSize) {
        rejected += 1;
        continue;
      }

      // Se for HEIC, converte imediatamente para preview funcionar
      if (isHEIC) {
        try {
          const heic2any = (await import("heic2any")).default;
          const converted = await heic2any({
            blob: file,
            toType: "image/jpeg",
            quality: 0.7
          });
          const blob = Array.isArray(converted) ? converted[0] : converted;
          file = new File([blob], file.name.replace(/\.(heic|heif)$/i, ".jpg"), { type: "image/jpeg" });
        } catch (err) {
          console.error("HEIC conversion error for preview", err);
          rejected += 1;
          continue;
        }
      }

      accepted.push({
        id: `${Date.now()}-${i}-${file.name}`,
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }

    if (rejected) toast.warning(`${rejected} arquivo(s) ignorado(s) ou falha na conversão`);
    if (accepted.length) setPending((cur) => [...cur, ...accepted]);
    if (inputRef.current) inputRef.current.value = "";
  };

  const removeOne = (id: string) => {
    setPending((cur) => {
      const item = cur.find((p) => p.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return cur.filter((p) => p.id !== id);
    });
  };

  const clearAll = () => {
    pending.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setPending([]);
  };

  const handlePublish = async () => {
    if (!pending.length) return;
    setPublishing(true);
    setProgress({ done: 0, total: pending.length });
    const result = await publishRawFilesToGallery({
      clientId,
      galleryId,
      files: pending.map((p) => p.file),
      startIndex,
      watermarkLogo,
      logoSettings,
      onProgress: setProgress,
    });
    setPublishing(false);
    setProgress(null);
    if (result.failed > 0) toast.warning(`${result.uploaded} publicadas, ${result.failed} falharam`);
    else toast.success(`${result.uploaded} fotos publicadas!`);
    clearAll();
    onPublished({ uploaded: result.uploaded, firstUrl: result.firstUrl });
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          addFiles(e.dataTransfer.files);
        }}
        className="border border-dashed rounded-lg p-6 text-center space-y-2"
      >
        <Upload className="w-8 h-8 mx-auto text-muted-foreground opacity-60" />
        <p className="text-sm text-muted-foreground">
          Arraste as fotos aqui ou selecione os arquivos. Elas serão publicadas exatamente como estão, sem moldura.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
        <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={publishing}>
          Selecionar arquivos
        </Button>
        <p className="text-[11px] text-muted-foreground">JPG, PNG, WebP ou HEIC · até {MAX_FILE_MB}MB por foto</p>
      </div>

      {pending.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{pending.length} foto(s) selecionada(s)</p>
            <Button variant="ghost" size="sm" className="gap-1 text-destructive" onClick={clearAll} disabled={publishing}>
              <Trash2 className="w-3.5 h-3.5" /> Limpar
            </Button>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-2">
            {pending.map((p) => (
              <div key={p.id} className="relative group rounded overflow-hidden border">
                <img src={p.previewUrl} alt={p.file.name} className="w-full aspect-square object-cover" />
                <button
                  onClick={() => removeOne(p.id)}
                  disabled={publishing}
                  className="absolute top-1 right-1 bg-black/60 text-white rounded p-1 opacity-0 group-hover:opacity-100"
                  title="Remover"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {progress && (
        <div className="space-y-1">
          <Progress value={(progress.done / Math.max(progress.total, 1)) * 100} />
          <p className="text-xs text-muted-foreground">
            {progress.done} de {progress.total} enviadas
          </p>
        </div>
      )}

      <Button onClick={handlePublish} disabled={publishing || pending.length === 0} className="gap-1.5">
        {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        Publicar {pending.length} fotos sem moldura
      </Button>
    </div>
  );
}
