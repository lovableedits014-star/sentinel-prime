import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Facebook, Link2, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { norm, similarity } from "@/lib/engagement-match";

export type UnlinkedAuthor = {
  platform_user_id: string;
  author_name: string | null;
  author_profile_picture: string | null;
  total_comments: number;
  last_seen: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  /** Pessoa alvo do vínculo. */
  pessoa: { id: string; nome: string } | null;
  platform?: "facebook" | "instagram";
  onLinked: () => void;
}


export default function VincularAutorDialog({
  open,
  onOpenChange,
  clientId,
  pessoa,
  platform = "facebook",
  onLinked,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [authors, setAuthors] = useState<UnlinkedAuthor[]>([]);
  const [busca, setBusca] = useState("");
  const [linking, setLinking] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !clientId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await (supabase as any).rpc("engagement_unlinked_authors", {
        p_client_id: clientId,
        p_platform: platform,
        p_limit: 300,
      });
      if (cancelled) return;
      if (error) {
        console.error(error);
        toast.error("Erro ao carregar autores: " + error.message);
        setAuthors([]);
      } else {
        setAuthors((data || []) as UnlinkedAuthor[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, clientId, platform]);

  const lista = useMemo(() => {
    const target = pessoa?.nome || "";
    const scored = authors.map((a) => ({ ...a, score: target ? similarity(target, a.author_name || "") : 0 }));
    const term = norm(busca);
    const filtered = term
      ? scored.filter((a) => norm(a.author_name).includes(term) || a.platform_user_id.includes(busca.trim()))
      : scored;
    return filtered.sort((a, b) => b.score - a.score || b.total_comments - a.total_comments);
  }, [authors, busca, pessoa?.nome]);

  async function handleLink(a: UnlinkedAuthor) {
    if (!pessoa) return;
    setLinking(a.platform_user_id);
    const { data, error } = await (supabase as any).rpc("engagement_link_author", {
      p_pessoa_id: pessoa.id,
      p_platform: platform,
      p_platform_user_id: a.platform_user_id,
      p_author_name: a.author_name,
      p_picture: a.author_profile_picture,
    });
    setLinking(null);
    if (error) {
      toast.error("Erro ao vincular: " + error.message);
      return;
    }
    const relinked = (data as any)?.relinked ?? 0;
    toast.success(
      `Perfil vinculado a ${pessoa.nome}${relinked > 0 ? ` — ${relinked} interações reaproveitadas` : ""}`,
    );
    onLinked();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Facebook className="h-4 w-4" />
            Vincular {platform === "facebook" ? "Facebook" : "Instagram"} por comentário
          </DialogTitle>
          <DialogDescription>
            {pessoa
              ? `Escolha o autor que corresponde a ${pessoa.nome}. O identificador interno da Meta será gravado e todas as interações (passadas e futuras) passam a contar.`
              : "Selecione uma pessoa primeiro."}
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome do autor…"
            className="pl-8"
          />
        </div>

        <div className="max-h-[45vh] space-y-1 overflow-y-auto">
          {loading ? (
            <>
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </>
          ) : lista.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum autor não vinculado encontrado. Se a pessoa ainda não comentou, aguarde a primeira
              interação — o vínculo poderá ser feito depois.
            </p>
          ) : (
            lista.map((a) => (
              <div
                key={a.platform_user_id}
                className="flex items-center gap-3 rounded-md border p-2 hover:bg-accent/50"
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage src={a.author_profile_picture || undefined} />
                  <AvatarFallback>{(a.author_name || "?").slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.author_name || "Sem nome"}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.total_comments} comentário(s)
                    {a.last_seen ? ` · último em ${new Date(a.last_seen).toLocaleDateString("pt-BR")}` : ""}
                  </p>
                </div>
                {a.score >= 0.5 && (
                  <Badge variant="secondary" className="gap-1 text-[10px]">
                    <Sparkles className="h-3 w-3" />
                    provável
                  </Badge>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!pessoa || linking === a.platform_user_id}
                  onClick={() => handleLink(a)}
                >
                  <Link2 className="mr-1 h-3.5 w-3.5" />
                  {linking === a.platform_user_id ? "…" : "Vincular"}
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
