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
import { similarity } from "@/lib/engagement-match";
import type { UnlinkedAuthor } from "./VincularAutorDialog";
import {
  buscarTime, cargoLabel, linkAuthor, ORIGEM_LABEL, upsertSocial, type BuscaRow,
} from "@/lib/engagement-team";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  /** Recarrega a tabela após cada gravação. */
  onSaved: () => void;
  /** Abre o cadastro de nova pessoa com o nome digitado. */
  onCreatePessoa: (nome: string) => void;
}

type AuthorWithPlatform = UnlinkedAuthor & { platform: "facebook" | "instagram" };

export default function CadastrarPerfilDialog({
  open, onOpenChange, clientId, onSaved, onCreatePessoa,
}: Props) {
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<BuscaRow[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [selected, setSelected] = useState<BuscaRow | null>(null);
  const [authors, setAuthors] = useState<AuthorWithPlatform[]>([]);
  const [loadingAuthors, setLoadingAuthors] = useState(false);
  const [igValue, setIgValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [linking, setLinking] = useState<string | null>(null);
  const [fbValue, setFbValue] = useState("");

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
      setFbValue("");
      setResultados([]);
    }
  }, [open]);

  // busca no servidor (todas as origens do time), com debounce
  useEffect(() => {
    if (!open || selected) return;
    const termo = query.trim();
    if (termo.length < 2) {
      setResultados([]);
      return;
    }
    let cancelled = false;
    setBuscando(true);
    const t = setTimeout(async () => {
      try {
        const rows = await buscarTime(clientId, termo, 20);
        if (!cancelled) setResultados(rows);
      } catch (e) {
        if (!cancelled) {
          console.error(e);
          setResultados([]);
        }
      } finally {
        if (!cancelled) setBuscando(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, open, clientId, selected]);

  // ao selecionar pessoa, pré-preenche o @ atual
  useEffect(() => {
    setIgValue(selected?.instagram_handle ? `@${selected.instagram_handle.replace(/^@/, "")}` : "");
    setFbValue(selected?.facebook_key || "");
  }, [selected?.ref_id]);

  const autoresFiltrados = useMemo(() => {
    if (query.trim().length < 2) return [];
    const q = query.trim().toLowerCase();
    return authors
      .filter((a) => (a.author_name || "").toLowerCase().includes(q))
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
  }, [authors, selected?.ref_id]);

  async function salvarInstagram() {
    if (!selected) return;
    const raw = igValue.trim();
    if (!raw) return;
    const handle =
      (raw.startsWith("http") ? extractHandleFromUrl("instagram", raw) : null) || raw.replace(/^@/, "");
    setSaving(true);
    try {
      const { relinked } = await upsertSocial(
        selected.origem,
        selected.ref_id,
        "instagram",
        handle,
        `https://instagram.com/${handle.replace(/^@/, "")}`,
      );
      toast.success(`@${handle} salvo${relinked > 0 ? ` — ${relinked} interações reaproveitadas` : ""}`);
      setSelected({ ...selected, instagram_handle: handle });
      onSaved();
    } catch (e) {
      toast.error("Erro ao salvar @: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  
  async function salvarFacebook() {
    if (!selected) return;
    const raw = fbValue.trim();
    if (!raw) return;
    
    setSaving(true);
    try {
      const { relinked, handle } = await upsertSocial(
        selected.origem,
        selected.ref_id,
        "facebook",
        raw,
        raw.startsWith("http") ? raw : `https://facebook.com/${raw}`
      );
      toast.success(`${handle} salvo${relinked > 0 ? ` — ${relinked} interações vinculadas` : ""}`);
      setSelected({ ...selected, facebook_key: handle });
      onSaved();
    } catch (e) {
      toast.error("Erro ao salvar Facebook: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function vincularAutor(a: AuthorWithPlatform, pessoa: BuscaRow) {
    setLinking(a.platform_user_id);
    try {
      const { relinked } = await linkAuthor(
        pessoa.origem,
        pessoa.ref_id,
        a.platform,
        a.platform_user_id,
        a.author_name,
        a.author_profile_picture,
      );
      toast.success(
        `${a.platform === "facebook" ? "Facebook" : "Instagram"} vinculado a ${pessoa.nome}` +
          (relinked > 0 ? ` — ${relinked} interações reaproveitadas` : ""),
      );
      setAuthors((prev) =>
        prev.filter((x) => !(x.platform === a.platform && x.platform_user_id === a.platform_user_id)),
      );
      if (a.platform === "facebook") {
        setSelected({ ...pessoa, facebook_key: a.platform_user_id });
      } else {
        setSelected({ ...pessoa, instagram_handle: a.author_name || pessoa.instagram_handle });
      }
      onSaved();
    } catch (e) {
      toast.error("Erro ao vincular: " + (e as Error).message);
    } finally {
      setLinking(null);
    }
  }

  function proximaPessoa() {
    setSelected(null);
    setQuery("");
    setIgValue("");
    setResultados([]);
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
              : "Digite o nome — a busca varre todo o time (CRM, funcionários, estrutura, contratados e portal) e também quem já comentou nas redes."}
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
                    {buscando ? (
                      <>
                        <Skeleton className="h-11 w-full" />
                        <Skeleton className="h-11 w-full" />
                      </>
                    ) : resultados.length === 0 ? (
                      <p className="px-1 py-2 text-xs text-muted-foreground">Nenhuma pessoa com esse nome.</p>
                    ) : (
                      resultados.map((p) => (
                        <button
                          key={`${p.origem}:${p.ref_id}`}
                          type="button"
                          onClick={() => setSelected(p)}
                          className="flex w-full items-center gap-2 rounded-md border p-2 text-left hover:bg-accent/50"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{p.nome}</p>
                            <p className="text-xs text-muted-foreground">
                              {cargoLabel(p.cargo)} · {ORIGEM_LABEL[p.origem]}
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
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" className="-ml-2" onClick={proximaPessoa}>
                <ArrowLeft className="mr-1 h-4 w-4" />
                Trocar pessoa
              </Button>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-8 text-[10px] gap-1"
                  onClick={() => window.open(`https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(selected.nome)}`, "_blank")}
                >
                  <Instagram className="h-3 w-3" /> Buscar no Insta
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-8 text-[10px] gap-1"
                  onClick={() => window.open(`https://www.facebook.com/search/people/?q=${encodeURIComponent(selected.nome)}`, "_blank")}
                >
                  <Facebook className="h-3 w-3" /> Buscar no Face
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm">
                <Instagram className="h-4 w-4" />
                Instagram
              </Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    value={igValue}
                    onChange={(e) => setIgValue(e.target.value)}
                    placeholder="@usuario ou link do perfil"
                    className="pr-10"
                    onKeyDown={(e) => e.key === "Enter" && salvarInstagram()}
                  />
                  {igValue && (
                    <div className="absolute right-2 top-2.5 flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5"
                        title="Ver perfil"
                        onClick={() => {
                          const handle = igValue.startsWith("http") 
                            ? extractHandleFromUrl("instagram", igValue) 
                            : igValue.replace(/^@/, "");
                          window.open(`https://instagram.com/${handle}`, "_blank");
                        }}
                      >
                        <Link2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
                <Button onClick={salvarInstagram} disabled={saving || !igValue.trim()}>
                  {saving ? "..." : <><Check className="mr-1 h-4 w-4" /> Salvar</>}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground leading-tight">
                Aceita @nome, nome ou URL. O sistema normaliza e busca interações passadas automaticamente.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm">
                <Facebook className="h-4 w-4" />
                Facebook
              </Label>
              {selected.facebook_key && /^\d{8,}$/.test(selected.facebook_key) ? (
                <div className="flex items-center justify-between p-2 rounded-md bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50">
                  <p className="text-sm">
                    Vinculado ao ID <span className="font-mono font-medium">{selected.facebook_key}</span>
                  </p>
                  <Badge variant="outline" className="text-[10px] text-emerald-700">Rastreável</Badge>
                </div>
              ) : (
                <>
                  <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50 rounded-md p-2 mb-3">
                    <p className="text-[11px] text-blue-800 dark:text-blue-400 leading-tight">
                      <strong>Dica:</strong> Se você tiver o link do perfil (ex: facebook.com/joao), cole abaixo para vincular agora. 
                      O ID numérico é extraído automaticamente.
                    </p>
                  </div>
                  <div className="flex gap-2 mb-3">
                    <div className="relative flex-1">
                      <Input 
                        value={fbValue}
                        onChange={(e) => setFbValue(e.target.value)}
                        placeholder="Link do perfil ou handle..." 
                        className="text-xs h-9 pr-10"
                        onKeyDown={(e) => e.key === "Enter" && salvarFacebook()}
                      />
                      {fbValue && (
                        <div className="absolute right-2 top-2 flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-5 w-5"
                            onClick={() => {
                              const handle = fbValue.startsWith("http") 
                                ? extractHandleFromUrl("facebook", fbValue) 
                                : fbValue;
                              if (handle) window.open(`https://facebook.com/${handle}`, "_blank");
                            }}
                          >
                            <Link2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                    <Button size="sm" onClick={salvarFacebook} disabled={saving || !fbValue.trim()}>
                      {saving ? "..." : <><Check className="mr-1 h-3 w-3" /> Salvar</>}
                    </Button>
                  </div>

                  <p className="text-[10px] font-semibold uppercase text-muted-foreground mt-4 mb-2">
                    Autores sugeridos (via comentários)
                  </p>

                  <div className="max-h-[28vh] space-y-1 overflow-y-auto">
                    {loadingAuthors ? (
                      <Skeleton className="h-11 w-full" />
                    ) : sugestoesFb.length === 0 ? (
                      <p className="py-3 text-xs text-muted-foreground">
                        Nenhum autor do Facebook detectado nos comentários recentes para este nome.
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
