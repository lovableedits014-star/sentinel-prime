import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Check, Facebook, Instagram, Link2, Search, Sparkles, UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { extractHandleFromUrl } from "@/lib/social-url";
import { matchesQuery, similarity } from "@/lib/engagement-match";
import type { UnlinkedAuthor } from "./VincularAutorDialog";

export type PessoaOption = {
  pessoa_id: string;
  nome: string;
  tipo_pessoa: string | null;
  instagram_handle: string | null;
  facebook_key: string | null;
  facebook_label: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  /** Pessoas já carregadas na aba (autocomplete em memória). */
  pessoas: PessoaOption[];
  /** Recarrega a tabela após cada gravação. */
  onSaved: () => void;
  /** Abre o cadastro de nova pessoa com o nome digitado. */
  onCreatePessoa: (nome: string) => void;
}

type AuthorWithPlatform = UnlinkedAuthor & { platform: "facebook" | "instagram" };

export default function CadastrarPerfilDialog({
  open, onOpenChange, clientId, pessoas, onSaved, onCreatePessoa,
}: Props) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<PessoaOption | null>(null);
  const [authors, setAuthors] = useState<AuthorWithPlatform[]>([]);
  const [loadingAuthors, setLoadingAuthors] = useState(false);
  const [igValue, setIgValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [linking, setLinking] = useState<string | null>(null);

  // carrega autores não vinculados (FB + IG) uma vez por abertura
  useEffect(() => {
    if (!open || !clientId) return;
    let cancelled = false;
    (async () => {
      setLoadingAuthors(true);
      const platforms: Array<"facebook" | "instagram"> = ["facebook", "instagram"];
      const results = await Promise.all(
        platforms.map(async (platform) => {
          const { data, error } = await (supabase as any).rpc("engagement_unlinked_authors", {
            p_client_id: clientId,
            p_platform: platform,
            p_limit: 300,
          });
          if (error) {
            console.error(error);
            return [] as AuthorWithPlatform[];
          }
          return ((data || []) as UnlinkedAuthor[]).map((a) => ({ ...a, platform }));
        }),
      );
      if (cancelled) return;
      setAuthors(results.flat());
      setLoadingAuthors(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, clientId]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setSelected(null);
      setIgValue("");
    }
  }, [open]);

  // ao selecionar pessoa, pré-preenche o @ atual
  useEffect(() => {
    setIgValue(selected?.instagram_handle ? `@${selected.instagram_handle.replace(/^@/, "")}` : "");
  }, [selected?.pessoa_id]);

  const pessoasFiltradas = useMemo(() => {
    if (query.trim().length < 2) return [];
    return pessoas
      .filter((p) => matchesQuery(p.nome, query))
      .sort((a, b) => similarity(query, b.nome) - similarity(query, a.nome) || a.nome.localeCompare(b.nome))
      .slice(0, 12);
  }, [pessoas, query]);

  const autoresFiltrados = useMemo(() => {
    if (query.trim().length < 2) return [];
    return authors
      .filter((a) => matchesQuery(a.author_name, query))
      .sort((a, b) => b.total_comments - a.total_comments)
      .slice(0, 12);
  }, [authors, query]);

  const sugestoesFb = useMemo(() => {
    if (!selected) return [];
    return authors
      .filter((a) => a.platform === "facebook")
      .map((a) => ({ ...a, score: similarity(selected.nome, a.author_name || "") }))
      .sort((a, b) => b.score - a.score || b.total_comments - a.total_comments)
      .slice(0, 8);
  }, [authors, selected?.pessoa_id]);

  async function salvarInstagram() {
    if (!selected) return;
    const raw = igValue.trim();
    if (!raw) return;
    const handle =
      (raw.startsWith("http") ? extractHandleFromUrl("instagram", raw) : null) || raw.replace(/^@/, "");
    setSaving(true);
    const { data, error } = await (supabase as any).rpc("engagement_upsert_social", {
      p_pessoa_id: selected.pessoa_id,
      p_plataforma: "instagram",
      p_usuario: handle,
      p_url: `https://instagram.com/${handle.replace(/^@/, "")}`,
    });
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar @: " + error.message);
      return;
    }
    const relinked = (data as any)?.relinked ?? 0;
    toast.success(`@${handle} salvo${relinked > 0 ? ` — ${relinked} interações reaproveitadas` : ""}`);
    setSelected({ ...selected, instagram_handle: handle });
    onSaved();
  }

  async function vincularAutor(a: AuthorWithPlatform, pessoa: PessoaOption) {
    setLinking(a.platform_user_id);
    const { data, error } = await (supabase as any).rpc("engagement_link_author", {
      p_pessoa_id: pessoa.pessoa_id,
      p_platform: a.platform,
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
      `${a.platform === "facebook" ? "Facebook" : "Instagram"} vinculado a ${pessoa.nome}` +
        (relinked > 0 ? ` — ${relinked} interações reaproveitadas` : ""),
    );
    setAuthors((prev) => prev.filter((x) => !(x.platform === a.platform && x.platform_user_id === a.platform_user_id)));
    if (a.platform === "facebook") {
      setSelected({ ...pessoa, facebook_key: a.platform_user_id, facebook_label: a.author_name });
    } else {
      setSelected({ ...pessoa, instagram_handle: a.author_name || pessoa.instagram_handle });
    }
    onSaved();
  }

  function proximaPessoa() {
    setSelected(null);
    setQuery("");
    setIgValue("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            Cadastrar perfil
          </DialogTitle>
          <DialogDescription>
            {selected
              ? `Cadastre o Instagram e vincule o Facebook de ${selected.nome}.`
              : "Digite o nome — o sistema mostra as pessoas cadastradas e quem já comentou nas redes."}
          </DialogDescription>
        </DialogHeader>

        {!selected ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Digite o nome da pessoa…"
                className="pl-8"
              />
            </div>

            <div className="max-h-[45vh] space-y-3 overflow-y-auto">
              {query.trim().length < 2 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Digite pelo menos 2 letras para ver as sugestões.
                </p>
              ) : (
                <>
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold uppercase text-muted-foreground">
                      Pessoas cadastradas
                    </p>
                    {pessoasFiltradas.length === 0 ? (
                      <p className="px-1 py-2 text-xs text-muted-foreground">Nenhuma pessoa com esse nome.</p>
                    ) : (
                      pessoasFiltradas.map((p) => (
                        <button
                          key={p.pessoa_id}
                          type="button"
                          onClick={() => setSelected(p)}
                          className="flex w-full items-center gap-2 rounded-md border p-2 text-left hover:bg-accent/50"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{p.nome}</p>
                            <p className="text-xs text-muted-foreground">
                              {p.tipo_pessoa || "—"}
                              {p.instagram_handle ? ` · @${p.instagram_handle}` : ""}
                              {p.facebook_key ? " · FB vinculado" : ""}
                            </p>
                          </div>
                          {p.instagram_handle && p.facebook_key && (
                            <Check className="h-4 w-4 text-emerald-600" />
                          )}
                        </button>
                      ))
                    )}
                  </div>

                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold uppercase text-muted-foreground">
                      Ainda não vinculados (quem comentou nas redes)
                    </p>
                    {loadingAuthors ? (
                      <>
                        <Skeleton className="h-11 w-full" />
                        <Skeleton className="h-11 w-full" />
                      </>
                    ) : autoresFiltrados.length === 0 ? (
                      <p className="px-1 py-2 text-xs text-muted-foreground">
                        Nenhum autor com esse nome nos comentários captados.
                      </p>
                    ) : (
                      autoresFiltrados.map((a) => (
                        <div
                          key={`${a.platform}:${a.platform_user_id}`}
                          className="flex items-center gap-2 rounded-md border p-2"
                        >
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={a.author_profile_picture || undefined} />
                            <AvatarFallback>{(a.author_name || "?").slice(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{a.author_name || "Sem nome"}</p>
                            <p className="text-xs text-muted-foreground">
                              {a.platform === "facebook" ? "Facebook" : "Instagram"} · {a.total_comments}{" "}
                              comentário(s)
                            </p>
                          </div>
                          <Badge variant="secondary" className="text-[10px]">
                            escolha a pessoa acima
                          </Badge>
                        </div>
                      ))
                    )}
                  </div>

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => onCreatePessoa(query.trim())}
                  >
                    <UserPlus className="mr-1 h-4 w-4" />
                    Criar pessoa “{query.trim()}”
                  </Button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Button variant="ghost" size="sm" className="-ml-2" onClick={proximaPessoa}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              Trocar pessoa
            </Button>

            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm">
                <Instagram className="h-4 w-4" />
                Instagram
              </Label>
              <div className="flex gap-2">
                <Input
                  value={igValue}
                  onChange={(e) => setIgValue(e.target.value)}
                  placeholder="@usuario ou link do perfil"
                  onKeyDown={(e) => e.key === "Enter" && salvarInstagram()}
                />
                <Button onClick={salvarInstagram} disabled={saving || !igValue.trim()}>
                  <Check className="mr-1 h-4 w-4" />
                  Salvar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Aceita @nome, nome ou URL — o sistema normaliza sozinho.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm">
                <Facebook className="h-4 w-4" />
                Facebook
              </Label>
              {selected.facebook_key ? (
                <p className="text-sm">
                  Vinculado a{" "}
                  <span className="font-medium">{selected.facebook_label || selected.facebook_key}</span>
                </p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    O Facebook só é rastreável por um comentário real — escolha abaixo o autor que corresponde a{" "}
                    {selected.nome}.
                  </p>
                  <div className="max-h-[28vh] space-y-1 overflow-y-auto">
                    {loadingAuthors ? (
                      <Skeleton className="h-11 w-full" />
                    ) : sugestoesFb.length === 0 ? (
                      <p className="py-3 text-xs text-muted-foreground">
                        Nenhum autor do Facebook disponível. Assim que essa pessoa comentar, ela aparece aqui.
                      </p>
                    ) : (
                      sugestoesFb.map((a) => (
                        <div key={a.platform_user_id} className="flex items-center gap-2 rounded-md border p-2">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={a.author_profile_picture || undefined} />
                            <AvatarFallback>{(a.author_name || "?").slice(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{a.author_name || "Sem nome"}</p>
                            <p className="text-xs text-muted-foreground">{a.total_comments} comentário(s)</p>
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
                            disabled={linking === a.platform_user_id}
                            onClick={() => vincularAutor(a, selected)}
                          >
                            <Link2 className="mr-1 h-3.5 w-3.5" />
                            {linking === a.platform_user_id ? "…" : "Vincular"}
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={proximaPessoa}>
                Cadastrar próxima pessoa
              </Button>
              <Button onClick={() => onOpenChange(false)}>Concluir</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
