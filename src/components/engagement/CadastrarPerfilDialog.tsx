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
  const [manualIgMode, setManualIgMode] = useState(false);
  const [manualFbMode, setManualFbMode] = useState(false);

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
      setManualIgMode(false);
      setManualFbMode(false);
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
    setFbValue("");
    setResultados([]);
    setManualIgMode(false);
    setManualFbMode(false);
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
              <Badge variant="outline" className="text-[10px] uppercase">
                {cargoLabel(selected.cargo)}
              </Badge>
            </div>

            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <UserPlus className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">{selected.nome}</h3>
                  <p className="text-xs text-muted-foreground">
                    {ORIGEM_LABEL[selected.origem]} {selected.cidade ? `· ${selected.cidade}` : ""}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {/* INSTAGRAM SECTION */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2 text-sm">
                    <Instagram className="h-4 w-4 text-pink-600" />
                    Instagram
                  </Label>
                  {selected.instagram_handle ? (
                    <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 border-emerald-200">
                      Vinculado: @{selected.instagram_handle}
                    </Badge>
                  ) : (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-6 text-[10px] px-2"
                      onClick={() => setManualIgMode(!manualIgMode)}
                    >
                      {manualIgMode ? "Ver sugestões" : "Digitar manualmente"}
                    </Button>
                  )}
                </div>

                {!selected.instagram_handle && !manualIgMode && (
                  <div className="space-y-2">
                    <Button 
                      variant="outline" 
                      className="w-full h-11 justify-start gap-2 bg-pink-50/50 hover:bg-pink-50 dark:bg-pink-950/10 dark:hover:bg-pink-950/20 border-pink-100 dark:border-pink-900/50"
                      onClick={() => window.open(`https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(selected.nome)}`, "_blank")}
                    >
                      <Search className="h-4 w-4 text-pink-600" />
                      <span className="flex-1 text-left text-xs">Pesquisar "{selected.nome}" no Instagram</span>
                      <Instagram className="h-4 w-4 opacity-50" />
                    </Button>

                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground">Sugestões (quem comentou)</p>
                      {loadingAuthors ? (
                        <Skeleton className="h-11 w-full" />
                      ) : (
                        authors
                          .filter(a => a.platform === "instagram")
                          .map(a => ({ ...a, score: similarity(selected.nome, a.author_name || "") }))
                          .sort((a, b) => b.score - a.score || b.total_comments - a.total_comments)
                          .slice(0, 3)
                          .map(a => (
                            <div key={a.platform_user_id} className="flex items-center gap-2 rounded-md border p-2 bg-white dark:bg-background">
                              <Avatar className="h-7 w-7">
                                <AvatarImage src={a.author_profile_picture || undefined} />
                                <AvatarFallback>{(a.author_name || "?").slice(0, 2).toUpperCase()}</AvatarFallback>
                              </Avatar>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-medium">{a.author_name}</p>
                                <p className="text-[10px] text-muted-foreground">{a.total_comments} coment.</p>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-[10px] hover:bg-pink-50"
                                disabled={linking === a.platform_user_id}
                                onClick={() => vincularAutor(a, selected)}
                              >
                                {linking === a.platform_user_id ? "…" : "Vincular"}
                              </Button>
                            </div>
                          ))
                      )}
                      {authors.filter(a => a.platform === "instagram").length === 0 && !loadingAuthors && (
                        <p className="py-2 text-[10px] text-center text-muted-foreground italic">
                          Nenhum comentário detectado. Use a busca ou digite manual.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {(manualIgMode || selected.instagram_handle) && (
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        value={igValue}
                        onChange={(e) => setIgValue(e.target.value)}
                        placeholder="@usuario ou link do perfil"
                        className="pr-10 h-10 text-sm"
                        onKeyDown={(e) => e.key === "Enter" && salvarInstagram()}
                      />
                      {igValue && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="absolute right-1 top-1.5 h-7 w-7"
                          onClick={() => {
                            const handle = igValue.startsWith("http") 
                              ? extractHandleFromUrl("instagram", igValue) 
                              : igValue.replace(/^@/, "");
                            window.open(`https://instagram.com/${handle}`, "_blank");
                          }}
                        >
                          <Link2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    <Button onClick={salvarInstagram} disabled={saving || !igValue.trim()} className="h-10 px-4 bg-pink-600 hover:bg-pink-700">
                      {saving ? "..." : <Check className="h-4 w-4" />}
                    </Button>
                  </div>
                )}
              </div>

              {/* FACEBOOK SECTION */}
              <div className="space-y-2 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2 text-sm">
                    <Facebook className="h-4 w-4 text-blue-600" />
                    Facebook
                  </Label>
                  {selected.facebook_key ? (
                    <Badge variant="secondary" className="bg-blue-50 text-blue-700 dark:bg-blue-950/30 border-blue-200">
                      Vinculado
                    </Badge>
                  ) : (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-6 text-[10px] px-2"
                      onClick={() => setManualFbMode(!manualFbMode)}
                    >
                      {manualFbMode ? "Ver sugestões" : "Colar link direto"}
                    </Button>
                  )}
                </div>

                {!selected.facebook_key && !manualFbMode && (
                  <div className="space-y-2">
                    <Button 
                      variant="outline" 
                      className="w-full h-11 justify-start gap-2 bg-blue-50/50 hover:bg-blue-50 dark:bg-blue-950/10 dark:hover:bg-blue-950/20 border-blue-100 dark:border-blue-900/50"
                      onClick={() => window.open(`https://www.facebook.com/search/people/?q=${encodeURIComponent(selected.nome)}`, "_blank")}
                    >
                      <Search className="h-4 w-4 text-blue-600" />
                      <span className="flex-1 text-left text-xs">Pesquisar "{selected.nome}" no Facebook</span>
                      <Facebook className="h-4 w-4 opacity-50" />
                    </Button>

                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground">Autores sugeridos (via comentários)</p>
                      {loadingAuthors ? (
                        <Skeleton className="h-11 w-full" />
                      ) : sugestoesFb.length === 0 ? (
                        <p className="py-2 text-[10px] text-center text-muted-foreground italic">
                          Sem comentários vinculados a este nome.
                        </p>
                      ) : (
                        sugestoesFb.slice(0, 4).map((a) => (
                          <div key={a.platform_user_id} className="flex items-center gap-2 rounded-md border p-2 bg-white dark:bg-background">
                            <Avatar className="h-7 w-7">
                              <AvatarImage src={a.author_profile_picture || undefined} />
                              <AvatarFallback>{(a.author_name || "?").slice(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-medium">{a.author_name}</p>
                              {a.score >= 0.5 && <Badge className="text-[8px] h-3 px-1" variant="secondary">Provável</Badge>}
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-[10px] hover:bg-blue-50"
                              disabled={linking === a.platform_user_id}
                              onClick={() => vincularAutor(a, selected)}
                            >
                              {linking === a.platform_user_id ? "…" : "Vincular"}
                            </Button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {(manualFbMode || selected.facebook_key) && (
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        value={fbValue}
                        onChange={(e) => setFbValue(e.target.value)}
                        placeholder="Link do perfil ou handle..."
                        className="pr-10 h-10 text-sm"
                        onKeyDown={(e) => e.key === "Enter" && salvarFacebook()}
                      />
                      {fbValue && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="absolute right-1 top-1.5 h-7 w-7"
                          onClick={() => {
                            const handle = fbValue.startsWith("http") 
                              ? extractHandleFromUrl("facebook", fbValue) 
                              : fbValue;
                            if (handle) window.open(`https://facebook.com/${handle}`, "_blank");
                          }}
                        >
                          <Link2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    <Button onClick={salvarFacebook} disabled={saving || !fbValue.trim()} className="h-10 px-4 bg-blue-600 hover:bg-blue-700">
                      {saving ? "..." : <Check className="h-4 w-4" />}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" size="sm" onClick={proximaPessoa}>
                Próximo registro
              </Button>
              <Button size="sm" onClick={() => onOpenChange(false)}>Fechar</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
