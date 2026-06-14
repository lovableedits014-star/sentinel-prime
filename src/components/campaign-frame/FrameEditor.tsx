import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { ImageIcon, Camera, Download, Loader2, Upload, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { DEFAULT_COMPOSITION, FrameComposition, preloadComposition, renderComposition } from "./types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import BatchFrameGenerator from "./BatchFrameGenerator";

interface Frame {
  id: string;
  nome: string;
  image_url: string;
  composition: FrameComposition | null;
}

export interface FrameEditorProps {
  clientId: string;
  defaultTab?: "individual" | "lote";
}

const CANVAS_SIZE = 1080;

const DEFAULT_FRAME: Frame = {
  id: "__default__",
  nome: "Moldura padrão",
  image_url: "",
  composition: {
    ...DEFAULT_COMPOSITION,
    background: { type: "color", color: "#0f172a" },
    photoCircle: { cx: 540, cy: 540, r: 430 },
    layers: [],
  },
};

export default function FrameEditor({ clientId, defaultTab = "individual" }: FrameEditorProps) {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [selectedFrame, setSelectedFrame] = useState<Frame | null>(null);
  const [photoFile, setPhotoFile] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [generating, setGenerating] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const photoImgRef = useRef<HTMLImageElement | null>(null);
  const cacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load active frames for client
  useEffect(() => {
    if (!clientId) return;
    (async () => {
      const { data } = await supabase.rpc("get_active_campaign_frames", { _client_id: clientId });
      const list = ((data ?? []) as any as Frame[]);
      const effective = list.length > 0 ? list : [DEFAULT_FRAME];
      setFrames(effective);
      if (!selectedFrame) setSelectedFrame(effective[0]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const getComposition = (f: Frame | null): FrameComposition => {
    if (!f) return DEFAULT_COMPOSITION;
    if (f.composition) return f.composition;
    return {
      ...DEFAULT_COMPOSITION,
      layers: [{ id: "legacy", name: "Moldura", imageUrl: f.image_url, x: 540, y: 540, scale: 1, rotation: 0, opacity: 1 }],
    };
  };

  // Preload composition images when frame changes
  useEffect(() => {
    if (!selectedFrame) return;
    (async () => {
      const cache = await preloadComposition(getComposition(selectedFrame));
      cacheRef.current = cache;
      redraw();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFrame]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const comp = getComposition(selectedFrame);
    renderComposition(ctx, comp, {
      photo: photoImgRef.current,
      photoZoom: zoom,
      photoOffset: offset,
      imageCache: cacheRef.current,
    });
  }, [zoom, offset, selectedFrame]);

  useEffect(() => { redraw(); }, [redraw]);

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione uma imagem");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;
      setPhotoFile(url);
      const img = new Image();
      img.onload = () => {
        photoImgRef.current = img;
        setZoom(1);
        setOffset({ x: 0, y: 0 });
        setResultUrl(null);
        redraw();
      };
      img.src = url;
    };
    reader.readAsDataURL(file);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!photoImgRef.current) return;
    setDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragging) return;
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const comp = getComposition(selectedFrame);
    const ratio = comp.canvas.width / rect.width;
    setOffset({
      x: (e.clientX - dragStart.x) * ratio,
      y: (e.clientY - dragStart.y) * ratio,
    });
  };
  const onPointerUp = () => setDragging(false);

  const handleGenerate = () => {
    if (!photoImgRef.current) {
      toast.error("Envie uma foto primeiro");
      return;
    }
    setGenerating(true);
    redraw();
    requestAnimationFrame(() => {
      const url = canvasRef.current?.toDataURL("image/png");
      setResultUrl(url ?? null);
      setGenerating(false);
      toast.success("Foto pronta!");
    });
  };

  const handleDownload = () => {
    if (!resultUrl) return;
    const link = document.createElement("a");
    link.href = resultUrl;
    link.download = `foto-campanha-${Date.now()}.png`;
    link.click();
  };

  return (
    <div>
      {frames.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm">Nenhuma moldura disponível ainda.</p>
          <p className="text-xs mt-1">Peça ao administrador para configurar uma moldura.</p>
        </div>
      ) : (
        <Tabs defaultValue={defaultTab} className="w-full">
          <TabsList className="grid grid-cols-2 w-full max-w-sm">
            <TabsTrigger value="individual">Individual</TabsTrigger>
            <TabsTrigger value="lote">Lote (várias fotos)</TabsTrigger>
          </TabsList>

          {frames.length > 1 && (
            <div className="mt-4">
              <Label className="text-xs mb-2 block">Moldura</Label>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {frames.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setSelectedFrame(f)}
                    className={`aspect-square rounded-md border-2 overflow-hidden transition-all ${selectedFrame?.id === f.id ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/50"}`}
                  >
                    <img src={f.image_url} alt={f.nome} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <TabsContent value="individual" className="mt-4">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Preview canvas */}
              <div className="space-y-3">
                <div className="aspect-square w-full bg-muted rounded-lg overflow-hidden border touch-none select-none">
                  <canvas
                    ref={canvasRef}
                    width={CANVAS_SIZE}
                    height={CANVAS_SIZE}
                    className="w-full h-full cursor-move"
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                  />
                </div>
                {photoFile && (
                  <div>
                    <Label className="text-xs">Zoom</Label>
                    <Slider value={[zoom]} min={0.5} max={3} step={0.05} onValueChange={(v) => setZoom(v[0])} />
                    <p className="text-[11px] text-muted-foreground mt-1">Arraste a imagem para reposicionar</p>
                  </div>
                )}
              </div>

              {/* Controls */}
              <div className="space-y-4">
                <div>
                  <Label className="text-xs mb-2 block">Sua foto</Label>
                  <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
                  <Button variant="outline" className="w-full gap-2" onClick={() => fileInputRef.current?.click()}>
                    {photoFile ? <Camera className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
                    {photoFile ? "Trocar foto" : "Enviar foto"}
                  </Button>
                </div>

                <div className="flex flex-col gap-2 pt-2">
                  <Button onClick={handleGenerate} disabled={!photoFile || generating} className="gap-2">
                    {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Gerar imagem final
                  </Button>
                  {resultUrl && (
                    <Button variant="default" onClick={handleDownload} className="gap-2 bg-primary">
                      <Download className="w-4 h-4" /> Baixar PNG (1080x1080)
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="lote" className="mt-4">
            <BatchFrameGenerator
              composition={selectedFrame ? getComposition(selectedFrame) : null}
              frameName={selectedFrame?.nome}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
