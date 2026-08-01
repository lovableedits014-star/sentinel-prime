import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Check, Facebook, Instagram, Link2, Plus, RefreshCw, Search, Trash2, X,
} from "lucide-react";
import { toast } from "sonner";
import { extractHandleFromUrl } from "@/lib/social-url";
import NovaPessoaDialog from "@/components/pessoas/NovaPessoaDialog";
import VincularAutorDialog from "./VincularAutorDialog";
import CadastrarPerfilDialog from "./CadastrarPerfilDialog";


type PerfilRow = {
  pessoa_id: string;
  nome: string;
  tipo_pessoa: string | null;
  telefone: string | null;
  supporter_id: string | null;
  instagram_handle: string | null;
  facebook_key: string | null;
  facebook_label: string | null;
  instagram_comments: number;
  facebook_comments: number;
  other_actions: number;
  last_interaction: string | null;
};

const isMetaScopedId = (v: string | null | undefined) => !!v && /^\d{8,}$/.test(v);

type Status = "rastreavel" | "aguardando" | "nao_rastreavel" | "sem_cadastro";

function statusOf(r: PerfilRow): Status {
  const interacted = r.instagram_comments + r.facebook_comments + r.other_actions > 0;
  const hasIg = !!r.instagram_handle;
  const hasFb = !!r.facebook_key;
  if (!hasIg && !hasFb) return "sem_cadastro";
  if (interacted) return "rastreavel";
  if (hasFb && !isMetaScopedId(r.facebook_key) && !hasIg) return "nao_rastreavel";
  return "aguardando";
}

const STATUS_META: Record<Status, { label: string; className: string; hint: string }> = {
  rastreavel: {
    label: "Rastreável",
    className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
    hint: "As interações desta pessoa já estão sendo contabilizadas.",
  },
  aguardando: {
    label: "Aguardando interação",
    className: "bg-amber-500/15 text-amber-600 border-amber-500/30",
    hint: "@ cadastrado, mas ainda sem comentário captado no período.",
  },
  nao_rastreavel: {
    label: "Não rastreável",
    className: "bg-destructive/15 text-destructive border-destructive/30",
    hint: "O Facebook só é rastreável quando vinculado por um comentário real (a Meta não expõe o @).",
  },
  sem_cadastro: {
    label: "Sem @",
    className: "bg-muted text-muted-foreground",
    hint: "Cadastre o Instagram e/ou vincule o Facebook para medir as interações.",
  },
};

export default function PerfisTimeTab({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PerfilRow[]>([]);
  const [days, setDays] = useState(30);
  const [busca, setBusca] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [novaPessoa, setNovaPessoa] = useState(false);
  const [vincular, setVincular] = useState<{ id: string; nome: string } | null>(null);

  // edição inline do instagram
  const [editing, setEditing] = useState<string | null>(null);
  const [igValue, setIgValue] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).rpc("engagement_perfis_overview", {
      p_client_id: clientId,
      p_days: days,
    });
    if (error) {
      console.error(error);
      toast.error("Erro ao carregar perfis: " + error.message);
      setRows([]);
    } else {
      setRows((data || []) as PerfilRow[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (clientId) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, days]);

  const filtered = useMemo(() => {
    const term = busca.trim().toLowerCase();
    return rows.filter((r) => {
      if (term && !(r.nome || "").toLowerCase().includes(term)) return false;
      if (statusFilter !== "todos" && statusOf(r) !== statusFilter) return false;
      return true;
    });
  }, [rows, busca, statusFilter]);

  const counts = useMemo(() => {
    const c: Record<Status, number> = { rastreavel: 0, aguardando: 0, nao_rastreavel: 0, sem_cadastro: 0 };
    for (const r of rows) c[statusOf(r)]++;
    return c;
  }, [rows]);

  async function saveInstagram(r: PerfilRow) {
    const raw = igValue.trim();
    if (!raw) {
      setEditing(null);
      return;
    }
    const handle = (raw.startsWith("http") ? extractHandleFromUrl("instagram", raw) : null) || raw.replace(/^@/, "");
    setSaving(true);
    const { data, error } = await (supabase as any).rpc("engagement_upsert_social", {
      p_pessoa_id: r.pessoa_id,
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
    toast.success(`@ salvo${relinked > 0 ? ` — ${relinked} interações reaproveitadas` : ""}`);
    setEditing(null);
    fetchData();
  }

  async function removeSocial(r: PerfilRow, plataforma: "instagram" | "facebook") {
    const { error } = await (supabase as any).rpc("engagement_remove_social", {
      p_pessoa_id: r.pessoa_id,
      p_plataforma: plataforma,
    });
    if (error) {
      toast.error("Erro ao remover: " + error.message);
      return;
    }
    toast.success("Vínculo removido");
    fetchData();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="px-3 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base sm:text-lg">Perfis do time</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Cadastre aqui o @ de cada pessoa. O Instagram é rastreado pelo próprio @. O Facebook só é
                rastreável quando vinculado a um comentário real — a Meta não expõe o @ público nos comentários.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
                <SelectTrigger className="h-9 w-[110px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 dias</SelectItem>
                  <SelectItem value="30">30 dias</SelectItem>
                  <SelectItem value="90">90 dias</SelectItem>
                  <SelectItem value="365">1 ano</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
                <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
              <Button size="sm" onClick={() => setNovaPessoa(true)}>
                <Plus className="mr-1 h-4 w-4" />
                Adicionar pessoa
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 px-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar pessoa…"
                className="pl-8"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-[190px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="rastreavel">Rastreável ({counts.rastreavel})</SelectItem>
                <SelectItem value="aguardando">Aguardando ({counts.aguardando})</SelectItem>
                <SelectItem value="nao_rastreavel">Não rastreável ({counts.nao_rastreavel})</SelectItem>
                <SelectItem value="sem_cadastro">Sem @ ({counts.sem_cadastro})</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pessoa</TableHead>
                    <TableHead>Instagram</TableHead>
                    <TableHead>Facebook</TableHead>
                    <TableHead className="text-center">Interações</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                        Nenhuma pessoa encontrada.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((r) => {
                      const st = statusOf(r);
                      const meta = STATUS_META[st];
                      const total = r.instagram_comments + r.facebook_comments + r.other_actions;
                      return (
                        <TableRow key={r.pessoa_id}>
                          <TableCell className="max-w-[220px]">
                            <p className="truncate text-sm font-medium">{r.nome}</p>
                            <p className="text-xs text-muted-foreground">
                              {r.tipo_pessoa || "—"}
                              {r.last_interaction
                                ? ` · última interação ${new Date(r.last_interaction).toLocaleDateString("pt-BR")}`
                                : ""}
                            </p>
                          </TableCell>

                          {/* Instagram */}
                          <TableCell>
                            {editing === r.pessoa_id ? (
                              <div className="flex items-center gap-1">
                                <Input
                                  autoFocus
                                  value={igValue}
                                  onChange={(e) => setIgValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") saveInstagram(r);
                                    if (e.key === "Escape") setEditing(null);
                                  }}
                                  placeholder="@usuario ou URL"
                                  className="h-8 w-[170px]"
                                />
                                <Button size="icon" variant="ghost" className="h-8 w-8" disabled={saving} onClick={() => saveInstagram(r)}>
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(null)}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : r.instagram_handle ? (
                              <div className="flex items-center gap-1">
                                <a
                                  href={`https://instagram.com/${r.instagram_handle}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-sm hover:underline"
                                >
                                  <Instagram className="h-3.5 w-3.5" />@{r.instagram_handle}
                                </a>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  onClick={() => {
                                    setEditing(r.pessoa_id);
                                    setIgValue(r.instagram_handle || "");
                                  }}
                                >
                                  <RefreshCw className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-destructive"
                                  onClick={() => removeSocial(r, "instagram")}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7"
                                onClick={() => {
                                  setEditing(r.pessoa_id);
                                  setIgValue("");
                                }}
                              >
                                <Plus className="mr-1 h-3 w-3" />@ Instagram
                              </Button>
                            )}
                          </TableCell>

                          {/* Facebook */}
                          <TableCell>
                            {r.facebook_key ? (
                              <div className="flex items-center gap-1">
                                <Badge
                                  variant="outline"
                                  className={`gap-1 text-[10px] ${
                                    isMetaScopedId(r.facebook_key)
                                      ? "border-emerald-500/30 text-emerald-600"
                                      : "border-destructive/30 text-destructive"
                                  }`}
                                >
                                  <Facebook className="h-3 w-3" />
                                  {isMetaScopedId(r.facebook_key)
                                    ? r.facebook_label || "vinculado"
                                    : `${r.facebook_label || r.facebook_key} (não rastreável)`}
                                </Badge>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  title="Revincular por comentário"
                                  onClick={() => setVincular({ id: r.pessoa_id, nome: r.nome })}
                                >
                                  <Link2 className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-destructive"
                                  onClick={() => removeSocial(r, "facebook")}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7"
                                onClick={() => setVincular({ id: r.pessoa_id, nome: r.nome })}
                              >
                                <Link2 className="mr-1 h-3 w-3" />
                                Vincular Facebook
                              </Button>
                            )}
                          </TableCell>

                          <TableCell className="text-center">
                            <div className="flex flex-col items-center">
                              <span className="text-sm font-semibold">{total}</span>
                              <span className="text-[10px] text-muted-foreground">
                                IG {r.instagram_comments} · FB {r.facebook_comments}
                                {r.other_actions > 0 ? ` · ♥ ${r.other_actions}` : ""}
                              </span>
                            </div>
                          </TableCell>

                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] ${meta.className}`} title={meta.hint}>
                              {meta.label}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Curtidas do Facebook aparecem na coluna ♥ quando a coleta de reações está ativa. Curtidas do
            Instagram e compartilhamentos não são disponibilizados pela Meta por pessoa — use as Missões do
            Portal para medir compartilhamento com link rastreável.
          </p>
        </CardContent>
      </Card>

      <NovaPessoaDialog
        open={novaPessoa}
        onOpenChange={setNovaPessoa}
        clientId={clientId}
        onSuccess={() => {
          setNovaPessoa(false);
          fetchData();
        }}
      />

      <VincularAutorDialog
        open={!!vincular}
        onOpenChange={(v) => !v && setVincular(null)}
        clientId={clientId}
        pessoa={vincular}
        platform="facebook"
        onLinked={fetchData}
      />
    </div>
  );
}
