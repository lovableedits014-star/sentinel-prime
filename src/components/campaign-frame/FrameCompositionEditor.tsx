import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowDown,
  ArrowUp,
  Image as ImageIcon,
  Layers,
  Loader2,
  Plus,
  Save,
  Trash2,
  Upload,
  Crosshair,
  Palette,
} from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_COMPOSITION,
  FrameComposition,
  FrameLayer,
  newLayer,
  preloadComposition,
  renderComposition,
} from "./types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientId: string;
  /** If provided, edits an existing frame */
  frameId?: string;
  initialName?: string;
  initialComposition?: FrameComposition;
  onSaved?: () => void;
}

const PREVIEW_PX = 480; // on-screen preview canvas size

export default function FrameCompositionEditor({
  open,
  onOpenChange,
  clientId,
  frameId,
  initialName,
  initialComposition,
  onSaved,
}: Props) {
  const [name, setName] = useState(initialName ?? "Nova moldura");
  const [comp, setComp] = useState<FrameComposition>(initialComposition ?? DEFAULT_COMPOSITION);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const bgInputRef = useRef<HTMLInputElement>(null);
  const layerInputRef = useRef<HTMLInputElement>(null);

  // Sync when opening with new initial values
  useEffect(() => {
    if (open) {
      setName(initialName ?? "Nova moldura");
      setComp(initialComposition ?? DEFAULT_COMPOSITION);
      setSelectedLayerId(null);
    }
  }, [open, initialName, initialComposition]);

  // Preload all images whenever composition image URLs change
  const imageUrlsKey = useMemo(() => {
    const urls: string[] = [];
    if (comp.background.type === "image") urls.push(comp.background.imageUrl);
    for (const l of comp.layers) urls.push(l.imageUrl);
    return urls.join("|");
  }, [comp]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cache = await preloadComposition(comp);
      if (cancelled) return;
      cacheRef.current = cache;
      draw();
    })();
    return () => {
      cancelled = true;
    };
  }, [imageUrlsKey]);

  // Redraw on every comp change
  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comp, selectedLayerId]);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    renderComposition(ctx, comp, { imageCache: cacheRef.current });

    // Editor overlays: photo circle outline + selected layer bounds
    const sx = canvas.width / comp.canvas.width;
    ctx.save();
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 4 / sx;
    ctx.setLineDash([20 / sx, 12 / sx]);
    ctx.beginPath();
    ctx.arc(comp.photoCircle.cx, comp.photoCircle.cy, comp.photoCircle.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    if (selectedLayerId) {
      const layer = comp.layers.find((l) => l.id === selectedLayerId);
      const img = layer ? cacheRef.current.get(layer.imageUrl) : null;
      if (layer && img) {
        const w = img.width * layer.scale;
        const h = img.height * layer.scale;
        ctx.save();
        ctx.translate(layer.x, layer.y);
        ctx.rotate((layer.rotation * Math.PI) / 180);
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 6 / sx;
        ctx.setLineDash([]);
        ctx.strokeRect(-w / 2, -h / 2, w, h);
        ctx.restore();
      }
    }
  };

  // ---------- Upload helpers ----------
  const uploadAsset = async (file: File): Promise<string> => {
    const ext = file.name.split(".").pop() || "png";
    const path = `${clientId}/assets/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from("campaign-frame-assets").upload(path, file, { upsert: false });
    if (error) throw error;
    const { data } = supabase.storage.from("campaign-frame-assets").getPublicUrl(path);
    return data.publicUrl;
  };

  const handleBackgroundUpload = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadAsset(file);
      setComp((c) => ({ ...c, background: { type: "image", imageUrl: url, color: c.background.type === "color" ? c.background.color : "#ffffff" } }));
    } catch (e: any) {
      toast.error(e.message || "Erro ao enviar imagem");
    } finally {
      setUploading(false);
      if (bgInputRef.current) bgInputRef.current.value = "";
    }
  };

  const handleAddLayer = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadAsset(file);
      const layer = newLayer(url, file.name.replace(/\.[^.]+$/, ""));
      setComp((c) => ({ ...c, layers: [...c.layers, layer] }));
      setSelectedLayerId(layer.id);
    } catch (e: any) {
      toast.error(e.message || "Erro ao enviar elemento");
    } finally {
      setUploading(false);
      if (layerInputRef.current) layerInputRef.current.value = "";
    }
  };

  // ---------- Layer ops ----------
  const updateLayer = (id: string, patch: Partial<FrameLayer>) => {
    setComp((c) => ({ ...c, layers: c.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
  };
  const removeLayer = (id: string) => {
    setComp((c) => ({ ...c, layers: c.layers.filter((l) => l.id !== id) }));
    if (selectedLayerId === id) setSelectedLayerId(null);
  };
  const moveLayer = (id: string, dir: -1 | 1) => {
    setComp((c) => {
      const idx = c.layers.findIndex((l) => l.id === id);
      if (idx < 0) return c;
      const next = idx + dir;
      if (next < 0 || next >= c.layers.length) return c;
      const arr = [...c.layers];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return { ...c, layers: arr };
    });
  };

  // ---------- Drag layer / circle on preview ----------
  const dragRef = useRef<{ kind: "layer" | "circle"; id?: string; startX: number; startY: number; origX: number; origY: number } | null>(null);

  const toCanvasCoords = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const ratio = comp.canvas.width / rect.width;
    return {
      x: (e.clientX - rect.left) * ratio,
      y: (e.clientY - rect.top) * ratio,
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const { x, y } = toCanvasCoords(e);
    // hit test from top layer down
    for (let i = comp.layers.length - 1; i >= 0; i--) {
      const l = comp.layers[i];
      const img = cacheRef.current.get(l.imageUrl);
      if (!img) continue;
      const w = img.width * l.scale;
      const h = img.height * l.scale;
      if (Math.abs(x - l.x) <= w / 2 && Math.abs(y - l.y) <= h / 2) {
        setSelectedLayerId(l.id);
        dragRef.current = { kind: "layer", id: l.id, startX: x, startY: y, origX: l.x, origY: l.y };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }
    }
    // else check circle
    const dx = x - comp.photoCircle.cx;
    const dy = y - comp.photoCircle.cy;
    if (Math.sqrt(dx * dx + dy * dy) <= comp.photoCircle.r) {
      dragRef.current = { kind: "circle", startX: x, startY: y, origX: comp.photoCircle.cx, origY: comp.photoCircle.cy };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const { x, y } = toCanvasCoords(e);
    const d = dragRef.current;
    const nx = d.origX + (x - d.startX);
    const ny = d.origY + (y - d.startY);
    if (d.kind === "layer" && d.id) {
      updateLayer(d.id, { x: nx, y: ny });
    } else if (d.kind === "circle") {
      setComp((c) => ({ ...c, photoCircle: { ...c.photoCircle, cx: nx, cy: ny } }));
    }
  };

  const onPointerUp = () => { dragRef.current = null; };

  // ---------- Save ----------
  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Dê um nome para a moldura");
      return;
    }
    setSaving(true);
    try {
      // Bake a thumbnail (image_url) using current composition without photo
      const off = document.createElement("canvas");
      off.width = comp.canvas.width;
      off.height = comp.canvas.height;
      const ctx = off.getContext("2d")!;
      const cache = await preloadComposition(comp);
      await renderComposition(ctx, comp, { imageCache: cache });
      const blob = await new Promise<Blob | null>((r) => off.toBlob(r, "image/png"));
      let thumbUrl = "";
      if (blob) {
        const path = `${clientId}/thumbs/${Date.now()}.png`;
        const { error } = await supabase.storage.from("campaign-frame-assets").upload(path, blob, { upsert: true, contentType: "image/png" });
        if (!error) {
          thumbUrl = supabase.storage.from("campaign-frame-assets").getPublicUrl(path).data.publicUrl;
        }
      }

      const payload: any = {
        client_id: clientId,
        nome: name.trim(),
        composition: comp,
        kind: "composition",
        is_active: true,
      };
      if (thumbUrl) payload.image_url = thumbUrl;

      if (frameId) {
        const { error } = await supabase.from("campaign_frames").update(payload).eq("id", frameId);
        if (error) throw error;
      } else {
        if (!thumbUrl) payload.image_url = ""; // schema requires NOT NULL
        const { error } = await supabase.from("campaign_frames").insert(payload);
        if (error) throw error;
      }
      toast.success("Moldura salva");
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const selectedLayer = comp.layers.find((l) => l.id === selectedLayerId) ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[95vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-primary" /> Editor de Moldura
          </DialogTitle>
          <DialogDescription>
            Defina o fundo, posicione o círculo da foto e adicione elementos por cima. Arraste no preview para reposicionar.
          </DialogDescription>
        </DialogHeader>

        <div className="grid lg:grid-cols-[480px_1fr] gap-6 flex-1 min-h-0">
          {/* Preview */}
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nome da moldura</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Padrão Campanha 2026" />
            </div>
            <div
              className="aspect-square w-full rounded-lg border-2 overflow-hidden bg-[conic-gradient(at_50%_50%,#f1f5f9_25%,#e2e8f0_25%_50%,#f1f5f9_50%_75%,#e2e8f0_75%)] bg-[length:24px_24px] touch-none select-none"
            >
              <canvas
                ref={canvasRef}
                width={comp.canvas.width}
                height={comp.canvas.height}
                style={{ width: PREVIEW_PX, height: PREVIEW_PX, maxWidth: "100%", aspectRatio: "1/1" }}
                className="w-full h-full cursor-move"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Círculo azul tracejado = onde a foto do usuário será colocada. Clique num elemento para selecionar e arraste para mover.
            </p>
          </div>

          {/* Controls */}
          <ScrollArea className="h-[70vh] pr-3">
            <Tabs defaultValue="bg" className="w-full">
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="bg" className="gap-1.5"><Palette className="w-3.5 h-3.5" /> Fundo</TabsTrigger>
                <TabsTrigger value="circle" className="gap-1.5"><Crosshair className="w-3.5 h-3.5" /> Círculo</TabsTrigger>
                <TabsTrigger value="layers" className="gap-1.5"><Layers className="w-3.5 h-3.5" /> Elementos ({comp.layers.length})</TabsTrigger>
              </TabsList>

              {/* Background */}
              <TabsContent value="bg" className="space-y-4 mt-4">
                <div className="flex gap-2">
                  <Button
                    variant={comp.background.type === "color" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setComp((c) => ({ ...c, background: { type: "color", color: c.background.type === "color" ? c.background.color : "#ffffff" } }))}
                  >Cor sólida</Button>
                  <Button
                    variant={comp.background.type === "image" ? "default" : "outline"}
                    size="sm"
                    onClick={() => bgInputRef.current?.click()}
                  >
                    <Upload className="w-3.5 h-3.5 mr-1" /> Imagem de fundo
                  </Button>
                  <input ref={bgInputRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && handleBackgroundUpload(e.target.files[0])} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Cor de fundo</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={comp.background.type === "color" ? comp.background.color : (comp.background.color ?? "#ffffff")}
                      onChange={(e) => setComp((c) => c.background.type === "color"
                        ? { ...c, background: { type: "color", color: e.target.value } }
                        : { ...c, background: { ...c.background, color: e.target.value } })}
                      className="h-10 w-16 rounded border cursor-pointer"
                    />
                    <Input
                      value={comp.background.type === "color" ? comp.background.color : (comp.background.color ?? "#ffffff")}
                      onChange={(e) => setComp((c) => c.background.type === "color"
                        ? { ...c, background: { type: "color", color: e.target.value } }
                        : { ...c, background: { ...c.background, color: e.target.value } })}
                      className="font-mono text-sm"
                    />
                  </div>
                </div>
                {comp.background.type === "image" && (
                  <div className="border rounded-md p-3 bg-muted/30 flex items-center gap-3">
                    <img src={comp.background.imageUrl} alt="bg" className="w-16 h-16 rounded object-cover border" />
                    <div className="flex-1">
                      <p className="text-xs font-medium">Imagem de fundo aplicada</p>
                      <p className="text-[11px] text-muted-foreground truncate">A imagem será ajustada para cobrir todo o canvas.</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setComp((c) => ({ ...c, background: { type: "color", color: "#ffffff" } }))}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </TabsContent>

              {/* Circle */}
              <TabsContent value="circle" className="space-y-4 mt-4">
                <p className="text-xs text-muted-foreground">Defina onde a foto do usuário aparece. Arraste no preview ou ajuste pelos controles.</p>
                <div>
                  <Label className="text-xs">Posição X — {Math.round(comp.photoCircle.cx)}</Label>
                  <Slider value={[comp.photoCircle.cx]} min={0} max={comp.canvas.width} step={1} onValueChange={(v) => setComp((c) => ({ ...c, photoCircle: { ...c.photoCircle, cx: v[0] } }))} />
                </div>
                <div>
                  <Label className="text-xs">Posição Y — {Math.round(comp.photoCircle.cy)}</Label>
                  <Slider value={[comp.photoCircle.cy]} min={0} max={comp.canvas.height} step={1} onValueChange={(v) => setComp((c) => ({ ...c, photoCircle: { ...c.photoCircle, cy: v[0] } }))} />
                </div>
                <div>
                  <Label className="text-xs">Raio — {Math.round(comp.photoCircle.r)}px</Label>
                  <Slider value={[comp.photoCircle.r]} min={50} max={Math.min(comp.canvas.width, comp.canvas.height) / 2} step={1} onValueChange={(v) => setComp((c) => ({ ...c, photoCircle: { ...c.photoCircle, r: v[0] } }))} />
                </div>
                <Button variant="outline" size="sm" onClick={() => setComp((c) => ({ ...c, photoCircle: { cx: c.canvas.width / 2, cy: c.canvas.height / 2, r: 380 } }))}>
                  Centralizar
                </Button>
              </TabsContent>

              {/* Layers */}
              <TabsContent value="layers" className="space-y-3 mt-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Camadas renderizadas em ordem (de cima pra baixo na lista = de baixo pra cima na tela).</p>
                  <Button size="sm" onClick={() => layerInputRef.current?.click()} disabled={uploading}>
                    {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
                    Adicionar PNG
                  </Button>
                  <input ref={layerInputRef} type="file" accept="image/png,image/webp" hidden onChange={(e) => e.target.files?.[0] && handleAddLayer(e.target.files[0])} />
                </div>

                {comp.layers.length === 0 ? (
                  <div className="border-2 border-dashed rounded-lg py-8 text-center text-muted-foreground">
                    <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Nenhum elemento ainda</p>
                    <p className="text-xs">Suba PNGs transparentes para o anel, logo, badges, fitas...</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {comp.layers.map((l) => (
                      <div
                        key={l.id}
                        onClick={() => setSelectedLayerId(l.id)}
                        className={`border rounded-md p-2 flex items-center gap-2 cursor-pointer ${selectedLayerId === l.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                      >
                        <img src={l.imageUrl} alt={l.name} className="w-10 h-10 object-contain border rounded bg-[conic-gradient(at_50%_50%,#f1f5f9_25%,#e2e8f0_25%_50%,#f1f5f9_50%_75%,#e2e8f0_75%)] bg-[length:8px_8px]" />
                        <Input
                          value={l.name}
                          onChange={(e) => updateLayer(l.id, { name: e.target.value })}
                          onClick={(e) => e.stopPropagation()}
                          className="h-7 text-xs flex-1"
                        />
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); moveLayer(l.id, -1); }}><ArrowDown className="w-3.5 h-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); moveLayer(l.id, 1); }}><ArrowUp className="w-3.5 h-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); removeLayer(l.id); }}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {selectedLayer && (
                  <div className="border rounded-lg p-3 space-y-3 bg-muted/30 mt-3">
                    <p className="text-xs font-semibold">Editar: {selectedLayer.name}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-[11px]">X — {Math.round(selectedLayer.x)}</Label>
                        <Slider value={[selectedLayer.x]} min={0} max={comp.canvas.width} step={1} onValueChange={(v) => updateLayer(selectedLayer.id, { x: v[0] })} />
                      </div>
                      <div>
                        <Label className="text-[11px]">Y — {Math.round(selectedLayer.y)}</Label>
                        <Slider value={[selectedLayer.y]} min={0} max={comp.canvas.height} step={1} onValueChange={(v) => updateLayer(selectedLayer.id, { y: v[0] })} />
                      </div>
                      <div>
                        <Label className="text-[11px]">Zoom — {selectedLayer.scale.toFixed(2)}x</Label>
                        <Slider value={[selectedLayer.scale]} min={0.05} max={3} step={0.01} onValueChange={(v) => updateLayer(selectedLayer.id, { scale: v[0] })} />
                      </div>
                      <div>
                        <Label className="text-[11px]">Rotação — {selectedLayer.rotation}°</Label>
                        <Slider value={[selectedLayer.rotation]} min={-180} max={180} step={1} onValueChange={(v) => updateLayer(selectedLayer.id, { rotation: v[0] })} />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-[11px]">Opacidade — {Math.round(selectedLayer.opacity * 100)}%</Label>
                        <Slider value={[selectedLayer.opacity]} min={0} max={1} step={0.01} onValueChange={(v) => updateLayer(selectedLayer.id, { opacity: v[0] })} />
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar moldura
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}