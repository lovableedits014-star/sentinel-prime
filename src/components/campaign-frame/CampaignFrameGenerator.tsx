import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Camera, ImageIcon, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { DEFAULT_COMPOSITION, FrameComposition, preloadComposition, renderComposition } from "./types";
import FrameEditor from "./FrameEditor";

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

export default function CampaignFrameGenerator({ clientId, triggerLabel = "Gerar minha foto", variant = "card" }: Props) {
  const [open, setOpen] = useState(false);
  const [showcaseFrame, setShowcaseFrame] = useState<Frame | null>(null);
  const showcaseCanvasRef = useRef<HTMLCanvasElement>(null);
  const showcaseCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

  // Showcase: load first active frame (independently of dialog open state)
  useEffect(() => {
    if (variant !== "showcase" || !clientId) return;
    (async () => {
      const { data } = await supabase.rpc("get_active_campaign_frames", { _client_id: clientId });
      const list = ((data ?? []) as any as Frame[]);
      const first = list[0] ?? DEFAULT_FRAME;
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

  const getComposition = (f: Frame | null): FrameComposition => {
    if (!f) return DEFAULT_COMPOSITION;
    if (f.composition) return f.composition;
    return {
      ...DEFAULT_COMPOSITION,
      layers: [{ id: "legacy", name: "Moldura", imageUrl: f.image_url, x: 540, y: 540, scale: 1, rotation: 0, opacity: 1 }],
    };
  };

  let Trigger: any;
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
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); }}>
      <DialogTrigger asChild>{Trigger}</DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-primary" /> Gerar foto de campanha</DialogTitle>
          <DialogDescription>Suba sua foto, ajuste o enquadramento e baixe pronta para usar no WhatsApp e redes sociais.</DialogDescription>
        </DialogHeader>
        <FrameEditor clientId={clientId} />
      </DialogContent>
    </Dialog>
  );
}
