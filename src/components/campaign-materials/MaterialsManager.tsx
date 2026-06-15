import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Upload, FileText, Image as ImageIcon, Video, Trash2, Pencil, Download } from "lucide-react";
import {
  CampaignMaterial,
  MATERIAL_BUCKET,
  MAX_BYTES,
  detectKind,
  formatSize,
} from "./types";

interface Props {
  clientId: string;
}

const KIND_ICON = {
  image: ImageIcon,
  video: Video,
  pdf: FileText,
};

export default function MaterialsManager({ clientId }: Props) {
  const [items, setItems] = useState<CampaignMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [editing, setEditing] = useState<CampaignMaterial | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("campaign_materials")
      .select("*")
      .eq("client_id", clientId)
      .order("order_index", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) toast.error("Erro ao carregar: " + error.message);
    setItems((data ?? []) as CampaignMaterial[]);
    setLoading(false);
  }

  useEffect(() => {
    if (clientId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    setUploading(true);
    setProgress({ done: 0, total: files.length });
    let ok = 0;
    let fail = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        if (file.size > MAX_BYTES) {
          toast.error(`${file.name}: maior que 100 MB`);
          fail++;
          continue;
        }
        const kind = detectKind(file);
        if (!kind) {
          toast.error(`${file.name}: formato não suportado`);
          fail++;
          continue;
        }
        const matId =
          (crypto as any).randomUUID?.() ?? `${Date.now()}-${i}`;
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
        const path = `${clientId}/materials/${matId}/${safeName}`;
        const { error: upErr } = await supabase.storage
          .from(MATERIAL_BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from(MATERIAL_BUCKET).getPublicUrl(path);
        const { data: { user } } = await supabase.auth.getUser();
        const title = file.name.replace(/\.[^.]+$/, "").slice(0, 120);
        const { error: insErr } = await supabase.from("campaign_materials").insert({
          id: matId,
          client_id: clientId,
          title,
          tags: [],
          kind,
          mime_type: file.type || "application/octet-stream",
          storage_path: path,
          public_url: pub.publicUrl,
          size_bytes: file.size,
          status: "published",
          order_index: items.length + i,
          created_by: user?.id ?? null,
        });
        if (insErr) throw insErr;
        ok++;
      } catch (e: any) {
        console.error(e);
        toast.error(`${file.name}: ${e.message ?? "erro no upload"}`);
        fail++;
      }
      setProgress({ done: i + 1, total: files.length });
    }
    setUploading(false);
    setProgress(null);
    if (fileRef.current) fileRef.current.value = "";
    if (ok) toast.success(`${ok} material(is) enviado(s)`);
    if (fail) toast.warning(`${fail} falhou(aram)`);
    await load();
  }

  async function remove(item: CampaignMaterial) {
    if (!confirm(`Remover "${item.title}"?`)) return;
    await supabase.storage.from(MATERIAL_BUCKET).remove([item.storage_path]);
    if (item.cover_url) {
      const coverPath = `${clientId}/materials/${item.id}/cover`;
      await supabase.storage
        .from(MATERIAL_BUCKET)
        .list(`${clientId}/materials/${item.id}`)
        .then(({ data }) => {
          const covers = (data ?? [])
            .filter((f) => f.name.startsWith("cover."))
            .map((f) => `${clientId}/materials/${item.id}/${f.name}`);
          if (covers.length) supabase.storage.from(MATERIAL_BUCKET).remove(covers);
        });
      void coverPath;
    }
    const { error } = await supabase.from("campaign_materials").delete().eq("id", item.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Removido");
      await load();
    }
  }

  async function toggleStatus(item: CampaignMaterial) {
    const next = item.status === "published" ? "draft" : "published";
    const { error } = await supabase
      .from("campaign_materials")
      .update({ status: next })
      .eq("id", item.id);
    if (error) toast.error(error.message);
    else {
      setItems((arr) => arr.map((x) => (x.id === item.id ? { ...x, status: next } : x)));
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-semibold">Materiais de campanha</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Suba PDFs, imagens (PNG/JPEG/WEBP) e vídeos (MP4) para que apoiadores possam baixar e
              compartilhar. Limite de 100 MB por arquivo.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              hidden
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.webp,.mp4,image/png,image/jpeg,image/webp,video/mp4,application/pdf"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              Enviar arquivos
            </Button>
          </div>
        </div>
        {progress && (
          <p className="text-xs text-muted-foreground mt-3">
            Enviando {progress.done}/{progress.total}…
          </p>
        )}
      </Card>

      {loading ? (
        <Card className="p-6 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin" />
        </Card>
      ) : items.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          Nenhum material ainda. Clique em <strong>Enviar arquivos</strong> para começar.
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((it) => {
            const Icon = KIND_ICON[it.kind];
            return (
              <Card key={it.id} className="p-3 space-y-2">
                <div className="aspect-video bg-muted rounded overflow-hidden flex items-center justify-center">
                  {it.kind === "image" ? (
                    <img src={it.public_url} alt={it.title} className="w-full h-full object-cover" />
                  ) : it.kind === "video" ? (
                    <video src={it.public_url} className="w-full h-full object-cover" muted />
                  ) : it.cover_url ? (
                    <img src={it.cover_url} alt={it.title} className="w-full h-full object-cover" />
                  ) : (
                    <FileText className="w-12 h-12 text-muted-foreground opacity-40" />
                  )}
                </div>
                <div className="flex items-start gap-2">
                  <Icon className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{it.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatSize(it.size_bytes)} · {it.download_count} downloads
                    </p>
                  </div>
                  <Badge variant={it.status === "published" ? "default" : "secondary"} className="text-[10px]">
                    {it.status === "published" ? "Público" : "Rascunho"}
                  </Badge>
                </div>
                {it.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {it.tags.map((t) => (
                      <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-1 pt-1 border-t">
                  <div className="flex items-center gap-2 mr-auto">
                    <Switch
                      checked={it.status === "published"}
                      onCheckedChange={() => toggleStatus(it)}
                    />
                    <span className="text-[11px] text-muted-foreground">Publicado</span>
                  </div>
                  <Button size="icon" variant="ghost" asChild>
                    <a href={it.public_url} target="_blank" rel="noreferrer" title="Abrir">
                      <Download className="w-4 h-4" />
                    </a>
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setEditing(it)} title="Editar">
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(it)} title="Remover">
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <EditDialog
        item={editing}
        onClose={() => setEditing(null)}
        onSaved={async () => { setEditing(null); await load(); }}
        clientId={clientId}
      />
    </div>
  );
}

function EditDialog({
  item,
  onClose,
  onSaved,
  clientId,
}: {
  item: CampaignMaterial | null;
  onClose: () => void;
  onSaved: () => void;
  clientId: string;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [saving, setSaving] = useState(false);
  const coverRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (item) {
      setTitle(item.title);
      setDescription(item.description ?? "");
      setTagsInput(item.tags.join(", "));
    }
  }, [item]);

  if (!item) return null;

  async function save() {
    if (!item) return;
    setSaving(true);
    const tags = tagsInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 8);
    const { error } = await supabase
      .from("campaign_materials")
      .update({
        title: title.trim().slice(0, 120),
        description: description.trim() || null,
        tags,
      })
      .eq("id", item.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Atualizado");
      onSaved();
    }
  }

  async function uploadCover(file: File) {
    if (!item) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Capa deve ser uma imagem");
      return;
    }
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${clientId}/materials/${item.id}/cover.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(MATERIAL_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: true });
    if (upErr) {
      toast.error(upErr.message);
      return;
    }
    const { data: pub } = supabase.storage.from(MATERIAL_BUCKET).getPublicUrl(path);
    const coverUrl = `${pub.publicUrl}?v=${Date.now()}`;
    const { error } = await supabase
      .from("campaign_materials")
      .update({ cover_url: coverUrl })
      .eq("id", item.id);
    if (error) toast.error(error.message);
    else toast.success("Capa atualizada");
  }

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar material</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
            />
          </div>
          <div>
            <Label>Tags (separadas por vírgula, máx. 8)</Label>
            <Input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="ex: Santinho, Pré-campanha, Stories"
            />
          </div>
          {(item.kind === "pdf" || item.kind === "video") && (
            <div>
              <Label>Capa (imagem opcional)</Label>
              <input
                ref={coverRef}
                type="file"
                hidden
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => e.target.files?.[0] && uploadCover(e.target.files[0])}
              />
              <div className="flex items-center gap-2 mt-1">
                {item.cover_url && (
                  <img src={item.cover_url} alt="capa" className="w-16 h-16 object-cover rounded border" />
                )}
                <Button variant="outline" size="sm" onClick={() => coverRef.current?.click()}>
                  Enviar capa
                </Button>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
