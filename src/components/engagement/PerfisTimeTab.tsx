import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table as TableIcon,
  Check,
  FacebookIcon,
  InstagramIcon,
  Link2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserCog,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { extractHandleFromUrl } from "@/lib/social-url";
import NovaPessoaDialog from "@/components/pessoas/NovaPessoaDialog";
import VincularAutorDialog, { type AlvoVinculo } from "./VincularAutorDialog";
import CadastrarPerfilDialog from "./CadastrarPerfilDialog";
import AlterarCargoDialog, { type AlvoCargo } from "./AlterarCargoDialog";
import {
  cargoLabel,
  fetchTeamOverview,
  isMetaScopedId,
  ORIGEM_LABEL,
  removeSocial as removeSocialRpc,
  statusOf,
  totalInteracoes,
  upsertSocial,
  type Status,
  type TeamRow,
} from "@/lib/engagement-team";

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
    hint: "O FacebookIcon só é rastreável quando vinculado a um comentário real (a Meta não expõe o @).",
  },
  sem_cadastro: {
    label: "Sem @",
    className: "bg-muted text-muted-foreground",
    hint: "Cadastre o InstagramIcon e/ou vincule o FacebookIcon para medir as interações.",
  },
};

const PAGE_SIZE = 50;

export default function PerfisTimeTab({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<TeamRow[]>([]);
  const [days, setDays] = useState(30);
  const [busca, setBusca] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [cargoFilter, setCargoFilter] = useState<string>("todos");
  const [origemFilter, setOrigemFilter] = useState<string>("todos");
  const [page, setPage] = useState(1);
  const [novaPessoa, setNovaPessoa] = useState(false);
  const [novaPessoaNome, setNovaPessoaNome] = useState("");
  const [cadastrarPerfil, setCadastrarPerfil] = useState(false);
  const [vincular, setVincular] = useState<AlvoVinculo | null>(null);
  const [alterarCargoAlvo, setAlterarCargoAlvo] = useState<AlvoCargo | null>(null);

  // edição inline do instagram
  const [editing, setEditing] = useState<string | null>(null);
  const [igValue, setIgValue] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      setRows(await fetchTeamOverview(clientId, days));
    } catch (e) {
      toast.error("Erro ao carregar perfis: " + (e as Error).message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (clientId) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, days]);

  useEffect(() => {
    setPage(1);
  }, [busca, statusFilter, cargoFilter, origemFilter]);

  const cargos = useMemo(
    () => Array.from(new Set(rows.map((r) => r.cargo))).sort((a, b) => cargoLabel(a).localeCompare(cargoLabel(b))),
    [rows],
  );

  const filtered = useMemo(() => {
    const term = busca.trim().toLowerCase();
    return rows.filter((r) => {
      if (term && !(r.nome || "").toLowerCase().includes(term) && !(r.telefone || "").includes(term)) return false;
      if (statusFilter !== "todos" && statusOf(r) !== statusFilter) return false;
      if (cargoFilter !== "todos" && r.cargo !== cargoFilter) return false;
      if (origemFilter !== "todos" && r.origem !== origemFilter) return false;
      return true;
    });
  }, [rows, busca, statusFilter, cargoFilter, origemFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  const counts = useMemo(() => {
    const c: Record<Status, number> = { rastreavel: 0, aguardando: 0, nao_rastreavel: 0, sem_cadastro: 0 };
    for (const r of rows) c[statusOf(r)]++;
    return c;
  }, [rows]);

  const rowKey = (r: TeamRow) => `${r.origem}:${r.ref_id}`;

  async function saveInstagram(r: TeamRow) {
    const raw = igValue.trim();
    if (!raw) {
      setEditing(null);
      return;
    }
    const handle = (raw.startsWith("http") ? extractHandleFromUrl("instagram", raw) : null) || raw.replace(/^@/, "");
    setSaving(true);
    try {
      const { relinked } = await upsertSocial(
        r.origem,
        r.ref_id,
        "instagram",
        handle,
        `https://instagram.com/${handle.replace(/^@/, "")}`,
      );
      toast.success(`@ salvo${relinked > 0 ? ` — ${relinked} interações reaproveitadas` : ""}`);
      setEditing(null);
      fetchData();
    } catch (e) {
      toast.error("Erro ao salvar @: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveSocial(r: TeamRow, plataforma: "instagram" | "facebook") {
    try {
      await removeSocialRpc(r.origem, r.ref_id, plataforma);
      toast.success("Vínculo removido");
      fetchData();
    } catch (e) {
      toast.error("Erro ao remover: " + (e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="px-3 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base sm:text-lg">Perfis do time</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Todo o time em uma única lista — CRM, funcionários, estrutura eleitoral, contratados e contas do
                portal. O InstagramIcon é rastreado pelo @; o FacebookIcon só é rastreável quando vinculado a um
                comentário real (a Meta não expõe o @ público).
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
              <Button size="sm" onClick={() => setCadastrarPerfil(true)}>
                <Search className="mr-1 h-4 w-4" />
                Cadastrar perfil
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setNovaPessoaNome(""); setNovaPessoa(true); }}>
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
                placeholder="Buscar por nome ou telefone…"
                className="pl-8"
              />
            </div>
            <Select value={cargoFilter} onValueChange={setCargoFilter}>
              <SelectTrigger className="h-9 w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os cargos</SelectItem>
                {cargos.map((c) => (
                  <SelectItem key={c} value={c}>
                    {cargoLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={origemFilter} onValueChange={setOrigemFilter}>
              <SelectTrigger className="h-9 w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as origens</SelectItem>
                {(Object.keys(ORIGEM_LABEL) as Array<keyof typeof ORIGEM_LABEL>).map((o) => (
                  <SelectItem key={o} value={o}>
                    {ORIGEM_LABEL[o]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                    <TableHead>Cargo</TableHead>
                    <TableHead>InstagramIcon</TableHead>
                    <TableHead>FacebookIcon</TableHead>
                    <TableHead className="text-center">Interações</TableHead>
                    <TableHead className="text-center">Missões</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                        Nenhuma pessoa encontrada.
                      </TableCell>
                    </TableRow>
                  ) : (
                    pageRows.map((r) => {
                      const key = rowKey(r);
                      const st = statusOf(r);
                      const meta = STATUS_META[st];
                      const total = totalInteracoes(r);
                      return (
                        <TableRow key={key}>
                          <TableCell className="max-w-[220px]">
                            <p className="truncate text-sm font-medium">{r.nome}</p>
                            <p className="text-xs text-muted-foreground">
                              {ORIGEM_LABEL[r.origem]}
                              {r.regiao || r.cidade ? ` · ${r.regiao || r.cidade}` : ""}
                              {r.last_interaction
                                ? ` · última ${new Date(r.last_interaction).toLocaleDateString("pt-BR")}`
                                : ""}
                            </p>
                          </TableCell>

                          <TableCell>
                            <Badge variant="secondary" className="text-[10px]">
                              {cargoLabel(r.cargo)}
                            </Badge>
                          </TableCell>

                          {/* InstagramIcon */}
                          <TableCell>
                            {editing === key ? (
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
                                  <InstagramIcon className="h-3.5 w-3.5" />@{r.instagram_handle}
                                </a>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  onClick={() => {
                                    setEditing(key);
                                    setIgValue(r.instagram_handle || "");
                                  }}
                                >
                                  <RefreshCw className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-destructive"
                                  onClick={() => handleRemoveSocial(r, "instagram")}
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
                                  setEditing(key);
                                  setIgValue("");
                                }}
                              >
                                <Plus className="mr-1 h-3 w-3" />@ InstagramIcon
                              </Button>
                            )}
                          </TableCell>

                          {/* FacebookIcon */}
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
                                  <FacebookIcon className="h-3 w-3" />
                                  {isMetaScopedId(r.facebook_key)
                                    ? r.facebook_label || "vinculado"
                                    : `${r.facebook_label || r.facebook_key} (não rastreável)`}
                                </Badge>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  title="Revincular por comentário"
                                  onClick={() => setVincular({ origem: r.origem, refId: r.ref_id, nome: r.nome })}
                                >
                                  <Link2 className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-destructive"
                                  onClick={() => handleRemoveSocial(r, "facebook")}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7"
                                onClick={() => setVincular({ origem: r.origem, refId: r.ref_id, nome: r.nome })}
                              >
                                <Link2 className="mr-1 h-3 w-3" />
                                Vincular FacebookIcon
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

                          <TableCell className="text-center">
                            <span className="text-sm font-semibold">{r.missoes_concluidas}</span>
                            <span className="ml-1 text-[10px] text-muted-foreground">
                              /{r.missoes_abertas + r.missoes_concluidas}
                            </span>
                          </TableCell>

                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] ${meta.className}`} title={meta.hint}>
                              {meta.label}
                            </Badge>
                          </TableCell>

                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7"
                              onClick={() =>
                                setAlterarCargoAlvo({
                                  origem: r.origem,
                                  refId: r.ref_id,
                                  nome: r.nome,
                                  cargo: r.cargo,
                                  telefone: r.telefone,
                                  cidade: r.cidade,
                                  regiao: r.regiao,
                                })
                              }
                            >
                              <UserCog className="mr-1 h-3 w-3" />
                              Cargo
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {!loading && filtered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                <TableIcon className="mr-1 inline h-3 w-3" />
                {filtered.length} pessoa(s) · página {page} de {totalPages}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Curtidas do FacebookIcon aparecem na coluna ♥ quando a coleta de reações está ativa. Curtidas do
            InstagramIcon e compartilhamentos não são disponibilizados pela Meta por pessoa — use as Missões do
            Portal para medir compartilhamento com link rastreável.
          </p>
        </CardContent>
      </Card>

      <CadastrarPerfilDialog
        open={cadastrarPerfil}
        onOpenChange={setCadastrarPerfil}
        clientId={clientId}
        onSaved={fetchData}
        onCreatePessoa={(nome) => {
          setNovaPessoaNome(nome);
          setNovaPessoa(true);
        }}
      />

      <NovaPessoaDialog
        open={novaPessoa}
        onOpenChange={setNovaPessoa}
        clientId={clientId}
        initialNome={novaPessoaNome}
        onSuccess={() => {
          setNovaPessoa(false);
          fetchData();
        }}
      />

      <VincularAutorDialog
        open={!!vincular}
        onOpenChange={(v) => {
          if (!v) setVincular(null);
        }}
        clientId={clientId}
        alvo={vincular}
        platform="facebook"
        onLinked={fetchData}
      />

      <AlterarCargoDialog
        open={!!alterarCargoAlvo}
        onOpenChange={(v) => {
          if (!v) setAlterarCargoAlvo(null);
        }}
        alvo={alterarCargoAlvo}
        onChanged={fetchData}
      />
    </div>
  );
}
