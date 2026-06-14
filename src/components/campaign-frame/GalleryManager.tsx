import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  FolderPlus,
  Loader2,
  Link2,
  Trash2,
  Image as ImageIcon,
  Send,
  Eye,
  EyeOff,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { DEFAULT_COMPOSITION, FrameComposition, preloadComposition } from "./types";
import BatchFrameGenerator from "./BatchFrameGenerator";
import { useBatchRenderer } from "./useBatchRenderer";
import { publishItemsToGallery, slugify } from "./useGalleryUpload";

interface Frame {
  id: string;
  nome: string;
  image_url: string;
  composition: FrameComposition | null;
}

interface Gallery {
  id: string;
  client_id: string;
  slug: string;
  nome: string;
  event_date: string | null;
  frame_id: string | null;
  status: "draft" | "published" | "archived";
  cover_url: string | null;
  created_at: string;
  item_count?: number;
}

interface Props {
  clientId: string;
  publicSlug: string | null;
}

const buildShareText = (link: string, galleryName: string) => {
  const dateStr = new Date().toLocaleDateString("pt-BR");
  return [
    `📸 Sua foto de *${galleryName}* já está pronta!`,
    `Acesse o link e baixe a sua foto com a moldura oficial do evento:`,
    `${link}`,
    ``,
    `✨ Corra antes que o "enviado por" apareça em outra foto! Baixe a sua agora e compartilhe com quem também participou.`,
    ``,
    `#FotosDoEvento #MolduraOficial`,
  ].join("\n");
};

const getComposition = (f: Frame | null | undefined): FrameComposition => {
  if (!f) return DEFAULT_COMPOSITION;
  if (f.composition) return f.composition;
  return {
    ...DEFAULT_COMPOSITION,
    layers: [
      {
        id: "legacy",
        name: "Moldura",
        imageUrl: f.image_url,
        x: 540,
        y: 540,
        scale: 1,
        rotation: 0,
        opacity: 1,
      },
    ],
  };
};

export default function GalleryManager({ clientId, publicSlug }: Props) {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [loading, setLoading] = useState(true);
  const [openNew, setOpenNew] = useState(false);
  const [activeGallery, setActiveGallery] = useState<Gallery | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [{ data: fr }, { data: gs }] = await Promise.all([
      supabase.rpc("get_active_campaign_frames", { _client_id: clientId }),
      supabase
        .from("campaign_photo_galleries")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false }),
    ]);
    const frameList = ((fr ?? []) as any) as Frame[];
    setFrames(frameList);
    const list = ((gs ?? []) as any) as Gallery[];

    // Count items per gallery
    if (list.length) {
      const ids = list.map((g) => g.id);
      const { data: items } = await supabase
        .from("campaign_photo_gallery_items")
        .select("gallery_id")
        .in("gallery_id", ids);
      const counts: Record<string, number> = {};
      for (const it of items ?? []) {
        counts[(it as any).gallery_id] = (counts[(it as any).gallery_id] ?? 0) + 1;
      }
      list.forEach((g) => (g.item_count = counts[g.id] ?? 0));
    }
    setGalleries(list);
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    if (clientId) loadAll();
  }, [clientId, loadAll]);

  const hubBase = useMemo(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/g/${publicSlug || clientId}`;
  }, [publicSlug, clientId]);

  const hubShareText = useMemo(() => {
    const lines = [
      `📸 As fotos do evento já estão disponíveis!`,
      `Acesse o link e baixe a sua foto com a moldura oficial:`,
      `${hubBase}`,
      ``,
      `✨ Compartilhe com quem também participou!`,
    ];
    return lines.join("\n");
  }, [hubBase]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">Galerias públicas</h3>
          <p className="text-xs text-muted-foreground">
            Crie pastas por evento, suba as fotos, publique e envie um único link para todos baixarem.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              navigator.clipboard.writeText(hubShareText);
              toast.success("Link do hub copiado com convite");
            }}
          >
            <Link2 className="w-4 h-4" /> Copiar link do hub
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setOpenNew(true)}>
            <FolderPlus className="w-4 h-4" /> Nova galeria
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="py-8 text-center text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Carregando…
        </div>
      ) : galleries.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground space-y-3">
            <ImageIcon className="w-10 h-10 mx-auto opacity-50" />
            <p>Nenhuma galeria ainda. Crie a primeira para o seu próximo evento.</p>
            <Button onClick={() => setOpenNew(true)} className="gap-1.5">
              <Plus className="w-4 h-4" /> Criar galeria
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {galleries.map((g) => (
            <GalleryCard
              key={g.id}
              gallery={g}
              hubBase={hubBase}
              onOpen={() => setActiveGallery(g)}
              onChanged={loadAll}
            />
          ))}
        </div>
      )}

      <NewGalleryDialog
        open={openNew}
        onOpenChange={setOpenNew}
        clientId={clientId}
        frames={frames}
        onCreated={(g) => {
          setOpenNew(false);
          loadAll();
          setActiveGallery(g);
        }}
      />

      {activeGallery && (
        <GalleryWorkspaceDialog
          gallery={activeGallery}
          frames={frames}
          onClose={() => setActiveGallery(null)}
          onChanged={loadAll}
          hubBase={hubBase}
        />
      )}
    </div>
  );
}

/* ------------ Card ------------ */
function GalleryCard({
  gallery,
  hubBase,
  onOpen,
  onChanged,
}: {
  gallery: Gallery;
  hubBase: string;
  onOpen: () => void;
  onChanged: () => void;
}) {
  const link = `${hubBase}/${gallery.slug}`;

  const handleDelete = async () => {
    if (!confirm(`Apagar a galeria "${gallery.nome}"? As fotos publicadas serão removidas.`)) return;
    const { error } = await supabase.from("campaign_photo_galleries").delete().eq("id", gallery.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Galeria apagada");
      onChanged();
    }
  };

  const togglePublish = async () => {
    const next = gallery.status === "published" ? "draft" : "published";
    const { error } = await supabase
      .from("campaign_photo_galleries")
      .update({ status: next })
      .eq("id", gallery.id);
    if (error) toast.error(error.message);
    else {
      toast.success(next === "published" ? "Galeria publicada" : "Galeria despublicada");
      onChanged();
    }
  };

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={onOpen}
        className="block w-full aspect-video bg-muted relative text-left"
      >
        {gallery.cover_url ? (
          <img src={gallery.cover_url} alt={gallery.nome} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <ImageIcon className="w-8 h-8 opacity-40" />
          </div>
        )}
        <div className="absolute top-2 right-2">
          <Badge variant={gallery.status === "published" ? "default" : "secondary"}>
            {gallery.status === "published" ? "Publicada" : gallery.status === "archived" ? "Arquivada" : "Rascunho"}
          </Badge>
        </div>
      </button>
      <CardContent className="p-3 space-y-2">
        <div className="min-w-0">
          <p className="font-medium truncate">{gallery.nome}</p>
          <p className="text-xs text-muted-foreground">
            {gallery.event_date
              ? new Date(gallery.event_date + "T00:00:00").toLocaleDateString("pt-BR")
              : "Sem data"}{" "}
            · {gallery.item_count ?? 0} fotos
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" className="gap-1 h-8" onClick={onOpen}>
            <ImageIcon className="w-3.5 h-3.5" /> Abrir
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1 h-8"
            onClick={() => {
              const shareText = buildShareText(link, gallery.nome);
              navigator.clipboard.writeText(shareText);
              toast.success("Link copiado com convite");
            }}
            disabled={gallery.status !== "published"}
          >
            <Link2 className="w-3.5 h-3.5" /> Link
          </Button>
          <Button size="sm" variant="outline" className="gap-1 h-8" onClick={togglePublish}>
            {gallery.status === "published" ? (
              <>
                <EyeOff className="w-3.5 h-3.5" /> Despublicar
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5" /> Publicar
              </>
            )}
          </Button>
          <Button size="sm" variant="ghost" className="gap-1 h-8 text-destructive" onClick={handleDelete}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------ New gallery dialog ------------ */
function NewGalleryDialog({
  open,
  onOpenChange,
  clientId,
  frames,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientId: string;
  frames: Frame[];
  onCreated: (g: Gallery) => void;
}) {
  const [nome, setNome] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [frameId, setFrameId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setNome("");
      setDate(new Date().toISOString().slice(0, 10));
      setFrameId(frames[0]?.id ?? "");
    }
  }, [open, frames]);

  const handleSave = async () => {
    if (!nome.trim()) return toast.error("Dê um nome ao evento");
    setSaving(true);
    const baseSlug = slugify(`${nome}-${date}`);
    let slug = baseSlug;

    // Ensure unique slug
    for (let i = 0; i < 5; i++) {
      const { data: existing } = await supabase
        .from("campaign_photo_galleries")
        .select("id")
        .eq("client_id", clientId)
        .eq("slug", slug)
        .maybeSingle();
      if (!existing) break;
      slug = `${baseSlug}-${Math.floor(Math.random() * 999)}`;
    }

    const { data, error } = await supabase
      .from("campaign_photo_galleries")
      .insert({
        client_id: clientId,
        slug,
        nome: nome.trim(),
        event_date: date || null,
        frame_id: frameId || null,
        status: "draft",
      })
      .select()
      .single();
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    onCreated(data as any as Gallery);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova galeria</DialogTitle>
          <DialogDescription>
            Crie uma pasta para o evento. Depois você sobe as fotos em lote e publica.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Nome do evento</Label>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Reunião nas Moreninhas"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Data</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Moldura</Label>
              <Select value={frameId} onValueChange={setFrameId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {frames.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------ Workspace dialog (upload + publish) ------------ */
function GalleryWorkspaceDialog({
  gallery,
  frames,
  onClose,
  onChanged,
  hubBase,
}: {
  gallery: Gallery;
  frames: Frame[];
  onClose: () => void;
  onChanged: () => void;
  hubBase: string;
}) {
  const frame = useMemo(() => frames.find((f) => f.id === gallery.frame_id) ?? frames[0], [
    frames,
    gallery.frame_id,
  ]);
  const composition = useMemo(() => (frame ? getComposition(frame) : null), [frame]);
  const batch = useBatchRenderer(composition);
  const [publishing, setPublishing] = useState(false);
  const [existingItems, setExistingItems] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("campaign_photo_gallery_items")
        .select("*")
        .eq("gallery_id", gallery.id)
        .order("order_index");
      setExistingItems(data ?? []);
    })();
  }, [gallery.id]);

  // Preload composition cache (already done by batch hook lazily)
  useEffect(() => {
    if (composition) preloadComposition(composition);
  }, [composition]);

  const handlePublish = async () => {
    const ready = batch.items.filter((i) => i.status === "ready");
    if (!ready.length) {
      toast.error("Nenhuma foto pronta para publicar");
      return;
    }
    setPublishing(true);
    const result = await publishItemsToGallery({
      clientId: gallery.client_id,
      galleryId: gallery.id,
      items: batch.items,
      onProgress: () => {},
    });
    // Set as published + cover if needed
    const patch: any = { status: "published" };
    if (!gallery.cover_url && result.firstUrl) patch.cover_url = result.firstUrl;
    await supabase.from("campaign_photo_galleries").update(patch).eq("id", gallery.id);

    setPublishing(false);
    if (result.failed > 0) toast.warning(`${result.uploaded} publicadas, ${result.failed} falharam`);
    else toast.success(`${result.uploaded} fotos publicadas!`);
    batch.clearAll();
    onChanged();
    const { data } = await supabase
      .from("campaign_photo_gallery_items")
      .select("*")
      .eq("gallery_id", gallery.id)
      .order("order_index");
    setExistingItems(data ?? []);
  };

  const handleRemoveExisting = async (item: any) => {
    if (!confirm("Remover esta foto da galeria?")) return;
    await supabase.storage.from("campaign-frame-assets").remove([item.storage_path]);
    await supabase.from("campaign_photo_gallery_items").delete().eq("id", item.id);
    setExistingItems((cur) => cur.filter((x) => x.id !== item.id));
    onChanged();
  };

  const link = `${hubBase}/${gallery.slug}`;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {gallery.nome}{" "}
            <Badge variant={gallery.status === "published" ? "default" : "secondary"}>
              {gallery.status === "published" ? "Publicada" : "Rascunho"}
            </Badge>
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2">
            <span>
              {gallery.event_date
                ? new Date(gallery.event_date + "T00:00:00").toLocaleDateString("pt-BR")
                : "Sem data"}{" "}
              · Moldura: <strong>{frame?.nome ?? "—"}</strong>
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1"
              onClick={() => {
                const shareText = buildShareText(link, gallery.nome);
                navigator.clipboard.writeText(shareText);
                toast.success("Link copiado com convite");
              }}
            >
              <Link2 className="w-3.5 h-3.5" /> Copiar link público
            </Button>
          </DialogDescription>
        </DialogHeader>

        {existingItems.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Fotos já publicadas ({existingItems.length})</h4>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-2">
              {existingItems.map((it) => (
                <div key={it.id} className="relative group rounded overflow-hidden border">
                  <img src={it.public_url} alt="" className="w-full aspect-square object-cover" />
                  <button
                    onClick={() => handleRemoveExisting(it)}
                    className="absolute top-1 right-1 bg-black/60 text-white rounded p-1 opacity-0 group-hover:opacity-100"
                    title="Remover"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="border-t pt-3">
          <h4 className="text-sm font-semibold mb-2">Adicionar novas fotos</h4>
          <BatchFrameGenerator composition={composition} frameName={frame?.nome} batch={batch} />
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
          <Button
            onClick={handlePublish}
            disabled={publishing || batch.items.filter((i) => i.status === "ready").length === 0}
            className="gap-1.5"
          >
            {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Publicar {batch.items.filter((i) => i.status === "ready").length} fotos novas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
