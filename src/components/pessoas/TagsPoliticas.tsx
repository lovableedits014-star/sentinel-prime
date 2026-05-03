import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, X, Tag, Search } from "lucide-react";
import { toast } from "sonner";

interface TagsPoliticasProps {
  pessoaId: string;
  clientId: string;
}

export default function TagsPoliticas({ pessoaId, clientId }: TagsPoliticasProps) {
  const [pessoaTags, setPessoaTags] = useState<any[]>([]);
  const [allTags, setAllTags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchTag, setSearchTag] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchPessoaTags();
  }, [pessoaId]);

  async function fetchPessoaTags() {
    setLoading(true);
    const { data } = await supabase
      .from("pessoas_tags")
      .select("id, tag_id, tags:tag_id(id, nome)")
      .eq("pessoa_id", pessoaId) as any;
    setPessoaTags(data || []);
    setLoading(false);
  }

  async function fetchAllTags() {
    const { data } = await supabase
      .from("tags")
      .select("id, nome")
      .eq("client_id", clientId)
      .order("nome") as any;
    setAllTags(data || []);
  }

  function openDialog() {
    fetchAllTags();
    setSearchTag("");
    setNewTagName("");
    setDialogOpen(true);
  }

  async function addExistingTag(tagId: string) {
    // Check if already assigned
    if (pessoaTags.some((pt: any) => pt.tag_id === tagId)) {
      toast.info("Tag já associada");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("pessoas_tags").insert({
      pessoa_id: pessoaId,
      tag_id: tagId,
    } as any);
    if (error) {
      toast.error("Erro ao adicionar tag");
    } else {
      toast.success("Tag adicionada");
      fetchPessoaTags();
    }
    setSaving(false);
  }

  async function createAndAddTag() {
    if (!newTagName.trim()) return;
    setSaving(true);

    // Try to insert tag (unique constraint will prevent duplicates)
    const { data: tagData, error: tagError } = await supabase
      .from("tags")
      .insert({ client_id: clientId, nome: newTagName.trim().toLowerCase() } as any)
      .select("id")
      .single() as any;

    let tagId: string;
    if (tagError) {
      // Tag might already exist, fetch it
      const { data: existing } = await supabase
        .from("tags")
        .select("id")
        .eq("client_id", clientId)
        .eq("nome", newTagName.trim().toLowerCase())
        .single() as any;
      if (!existing) {
        toast.error("Erro ao criar tag");
        setSaving(false);
        return;
      }
      tagId = existing.id;
    } else {
      tagId = tagData.id;
    }

    // Link to pessoa
    const { error } = await supabase.from("pessoas_tags").insert({
      pessoa_id: pessoaId,
      tag_id: tagId,
    } as any);

    if (error) {
      if (error.code === "23505") toast.info("Tag já associada");
      else toast.error("Erro ao associar tag");
    } else {
      toast.success("Tag criada e adicionada");
      setNewTagName("");
      fetchAllTags();
      fetchPessoaTags();
    }
    setSaving(false);
  }

  async function removeTag(pessoaTagId: string) {
    const { error } = await supabase.from("pessoas_tags").delete().eq("id", pessoaTagId);
    if (error) {
      toast.error("Erro ao remover tag");
    } else {
      setPessoaTags(prev => prev.filter((pt: any) => pt.id !== pessoaTagId));
      toast.success("Tag removida");
    }
  }

  const assignedTagIds = new Set(pessoaTags.map((pt: any) => pt.tag_id));
  const filteredTags = allTags.filter(
    (t: any) => !assignedTagIds.has(t.id) && t.nome.includes(searchTag.toLowerCase())
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <Tag className="w-5 h-5 text-primary" />
          <CardTitle className="text-base">TAGS Políticas</CardTitle>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={openDialog}>
          <Plus className="w-3.5 h-3.5" /> Adicionar TAG
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
          </div>
        ) : pessoaTags.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhuma tag associada.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {pessoaTags.map((pt: any) => (
              <Badge key={pt.id} variant="secondary" className="text-xs gap-1.5 pr-1">
                {pt.tags?.nome || "—"}
                <button
                  onClick={() => removeTag(pt.id)}
                  className="ml-0.5 rounded-full hover:bg-destructive/20 p-0.5 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar TAG</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Search existing */}
            <div className="space-y-2">
              <Label>Buscar tag existente</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar..."
                  value={searchTag}
                  onChange={(e) => setSearchTag(e.target.value)}
                  className="pl-9"
                />
              </div>
              {filteredTags.length > 0 && (
                <div className="max-h-40 overflow-y-auto border rounded-md p-2 space-y-1">
                  {filteredTags.map((tag: any) => (
                    <button
                      key={tag.id}
                      onClick={() => addExistingTag(tag.id)}
                      disabled={saving}
                      className="w-full text-left px-3 py-1.5 text-sm rounded hover:bg-accent hover:text-accent-foreground transition-colors"
                    >
                      {tag.nome}
                    </button>
                  ))}
                </div>
              )}
              {searchTag && filteredTags.length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhuma tag encontrada.</p>
              )}
            </div>

            {/* Create new */}
            <div className="space-y-2 border-t pt-4">
              <Label>Criar nova tag</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Nome da tag..."
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  maxLength={100}
                  onKeyDown={(e) => e.key === "Enter" && createAndAddTag()}
                />
                <Button onClick={createAndAddTag} disabled={saving || !newTagName.trim()} size="sm">
                  Criar
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
