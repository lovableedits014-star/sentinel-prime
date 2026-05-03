import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent } from "@/components/ui/card";
import { Camera, Download, ImageIcon, Loader2, Upload, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { DEFAULT_COMPOSITION, FrameComposition, preloadComposition, renderComposition } from "./types";

interface Frame {
  id: string;
  nome: string;
  image_url: string;
  composition: FrameComposition | null;
}

interface Props {
  clientId: string;
  triggerLabel?: string;
  variant?: "card" | "button" | "showcase";
}

const CANVAS_SIZE = 1080;

export default function CampaignFrameGenerator({ clientId, triggerLabel = "Gerar minha foto", variant = "card" }: Props) {
  const [open, setOpen] = useState(false);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [selectedFrame, setSelectedFrame] = useState<Frame | null>(null);
  const [showcaseFrame, setShowcaseFrame] = useState<Frame | null>(null);
  const showcaseCanvasRef = useRef<HTMLCanvasElement>(null);
  const showcaseCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
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
    if (!open || !clientId) return;
    (async () => {
      const { data } = await supabase
        .from("campaign_frames")
        .select("id, nome, image_url, composition")
        .eq("client_id", clientId)
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      const list = (data ?? []) as any as Frame[];
      setFrames(list);
      if (list.length > 0 && !selectedFrame) setSelectedFrame(list[0]);
    })();
  }, [open, clientId]);

  // Showcase: load first active frame (independently of dialog open state)
  useEffect(() => {
    if (variant !== "showcase" || !clientId) return;
    (async () => {
      const { data } = await supabase
        .from("campaign_frames")
        .select("id, nome, image_url, composition")
        .eq("client_id", clientId)
        .eq("is_active", true)
        .order("display_order", { ascending: true })
        .limit(1);
      const first = (data?.[0] ?? null) as any as Frame | null;
      setShowcaseFrame(first);
    })();
  }, [variant, clientId]);

  // Render empty showcase preview (no user photo)
  useEffect(() => {
    if (variant !== "showcase" || !showcaseFrame) return;
    const canvas = showcaseCanvasRef.current;
    if (!canvas) return;
    (async () => {
      const comp = getComposition(showcaseFrame);
      const cache = await preloadComposition(comp);
      showcaseCacheRef.current = cache;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      renderComposition(ctx, comp, {
        photo: null,
        photoZoom: 1,
        photoOffset: { x: 0, y: 0 },
        imageCache: cache,
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, showcaseFrame]);

  // Get effective composition (composition column OR fallback wrapping image_url)
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
    if (!selectedFrame || !open) return;
    (async () => {
      const cache = await preloadComposition(getComposition(selectedFrame));
      cacheRef.current = cache;
      redraw();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFrame, open]);

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

  let Trigger: JSX.Element;
  if (variant === "button") {
    Trigger = (
      <Button className="gap-2"><Sparkles className="w-4 h-4" />{triggerLabel}</Button>
    );
  } else if (variant === "showcase") {
    Trigger = (
      <Card className="cursor-pointer hover:shadow-lg transition-all overflow-hidden border-2 border-primary/20 bg-gradient-to-br from-primary/5 via-background to-primary/10">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <div>
              <p className="text-base font-bold leading-tight">Foto de campanha personalizada</p>
              <p className="text-xs text-muted-foreground">Mostre seu apoio com uma moldura oficial</p>
            </div>
          </div>
          <div className="relative mx-auto w-48 h-48 sm:w-56 sm:h-56 rounded-full overflow-hidden bg-muted shadow-md ring-4 ring-background">
            {showcaseFrame ? (
              <canvas
                ref={showcaseCanvasRef}
                width={CANVAS_SIZE}
                height={CANVAS_SIZE}
                className="w-full h-full"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ImageIcon className="w-10 h-10 text-muted-foreground/40" />
              </div>
            )}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="bg-background/80 backdrop-blur-sm rounded-full px-3 py-1 text-[11px] font-medium text-muted-foreground border">
                sua foto aqui
              </div>
            </div>
          </div>
          <Button size="lg" className="w-full gap-2 font-semibold shadow-md">
            <Camera className="w-5 h-5" /> Gerar minha foto de perfil
          </Button>
        </CardContent>
      </Card>
    );
  } else {
    Trigger = (
      <Card className="cursor-pointer hover:shadow-md transition-shadow border-dashed">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Gerar minha foto de campanha</p>
            <p className="text-xs text-muted-foreground truncate">Use uma moldura personalizada e baixe pra usar no WhatsApp</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setResultUrl(null); } }}>
      <DialogTrigger asChild>{Trigger}</DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-primary" /> Gerar foto de campanha</DialogTitle>
          <DialogDescription>Suba sua foto, ajuste o enquadramento e baixe pronta para usar no WhatsApp e redes sociais.</DialogDescription>
        </DialogHeader>

        {frames.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Nenhuma moldura disponível ainda.</p>
            <p className="text-xs mt-1">Peça ao administrador para configurar uma moldura.</p>
          </div>
        ) : (
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
                <Label className="text-xs mb-2 block">1. Sua foto</Label>
                <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
                <Button variant="outline" className="w-full gap-2" onClick={() => fileInputRef.current?.click()}>
                  {photoFile ? <Camera className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
                  {photoFile ? "Trocar foto" : "Enviar foto"}
                </Button>
              </div>

              {frames.length > 1 && (
                <div>
                  <Label className="text-xs mb-2 block">2. Moldura</Label>
                  <div className="grid grid-cols-3 gap-2">
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
        )}
      </DialogContent>
    </Dialog>
  );
}