import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell, Tooltip } from "recharts";
import { MapPin, Users, TrendingUp, TrendingDown, AlertTriangle, Search, UserPlus, CalendarDays, BarChart3, Clock, Loader2, X, Globe2, Building2, Home, RefreshCw, ChevronDown } from "lucide-react";
import { useState, useMemo } from "react";
import { format, subDays, startOfDay, isAfter, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BrazilMap } from "@/components/territorial/BrazilMap";
import { LocalityDetailDialog } from "@/components/territorial/LocalityDetailDialog";
import { MergeLocalitiesDialog } from "@/components/territorial/MergeLocalitiesDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Merge } from "lucide-react";
import { resolveUF, ufName, ufRegion, UF_LIST } from "@/lib/brazil-geo";
import { toast } from "sonner";

interface LocationGroup {
  key: string;
  city: string;
  neighborhood: string | null;
  state: string | null;
  count: number;
  cityVariants?: Record<string, number>;
  neighVariants?: Record<string, number>;
}

interface PessoaRow {
  id: string;
  nome: string;
  cidade: string | null;
  bairro: string | null;
  telefone: string | null;
  cpf?: string | null;
  supporter_id?: string | null;
  tipo_pessoa: string;
  origem_contato: string;
  created_at: string;
}

const canonPerson = (v: string | null | undefined) =>
  (v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const onlyDigits = (v: string | null | undefined) => (v || "").replace(/\D/g, "");
const cleanCity = (v: string | null | undefined) => ((v || "").trim().replace(/[\s,/-]+[A-Za-z]{2}\s*$/, "").trim() || (v || "").trim());
const phoneIdentity = (v: string | null | undefined) => {
  const digits = onlyDigits(v);
  if (digits.length < 8) return "";
  return digits.length > 11 ? digits.slice(-11) : digits;
};

const personAliases = (p: { name?: string | null; phone?: string | null; cpf?: string | null; city?: string | null; neighborhood?: string | null; supporter_id?: string | null }) => {
  const aliases: string[] = [];
  const cpf = onlyDigits(p.cpf);
  const phone = phoneIdentity(p.phone);
  const name = canonPerson(p.name);
  if (p.supporter_id) aliases.push(`supporter:${p.supporter_id}`);
  if (cpf.length === 11) aliases.push(`cpf:${cpf}`);
  if (phone) aliases.push(`phone:${phone}`);
  if (name) aliases.push(`name-local:${name}|${canonPerson(cleanCity(p.city))}|${canonPerson(p.neighborhood)}`);
  return aliases;
};

function dedupeByPerson<T extends { id: string; name: string | null; phone: string | null; cpf?: string | null; city: string | null; neighborhood: string | null; state?: string | null; supporter_id?: string | null; created_at: string }>(entries: T[]) {
  const aliasToKey = new Map<string, string>();
  const people = new Map<string, T>();
  for (const entry of entries) {
    const aliases = personAliases(entry);
    const existingKey = aliases.map((a) => aliasToKey.get(a)).find(Boolean);
    if (existingKey && people.has(existingKey)) {
      const current: any = people.get(existingKey)!;
      if (!current.phone && entry.phone) current.phone = entry.phone;
      if (!current.cpf && entry.cpf) current.cpf = entry.cpf;
      if (!current.city && entry.city) current.city = entry.city;
      if (!current.neighborhood && entry.neighborhood) current.neighborhood = entry.neighborhood;
      if (!current.state && entry.state) current.state = entry.state;
      if (new Date(entry.created_at).getTime() < new Date(current.created_at).getTime()) current.created_at = entry.created_at;
      aliases.forEach((a) => aliasToKey.set(a, existingKey));
    } else {
      const key = aliases[0] || `row:${entry.id}`;
      people.set(key, { ...entry });
      aliases.forEach((a) => aliasToKey.set(a, key));
    }
  }
  return Array.from(people.values());
}

function MetricCard({ icon: Icon, label, value, accent, description }: { icon: any; label: string; value: number; accent?: boolean; description?: string }) {
  return (
    <Card className={accent ? "border-primary/30 bg-primary/5" : ""}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={`w-4 h-4 ${accent ? "text-primary" : "text-muted-foreground"}`} />
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <p className={`text-2xl font-bold ${accent ? "text-primary" : ""}`}>{value.toLocaleString("pt-BR")}</p>
        {description && <p className="text-[10px] text-muted-foreground mt-0.5">{description}</p>}
      </CardContent>
    </Card>
  );
}

function DistributionRow({ label, count, total, color = "bg-primary" }: { label: string; count: number; total: number; color?: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="truncate font-medium">{label}</span>
        <span className="text-muted-foreground shrink-0 ml-2">{count} ({pct.toFixed(0)}%)</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(pct, 1)}%` }} />
      </div>
    </div>
  );
}

// Lista agrupada por cidade: cada cidade vira um "container" colapsável com seus bairros dentro.
function CityGroupedList({
  groups,
  maxCount,
  selectedKeys,
  onToggleSelect,
  onOpenDetail,
  getHeatBadge,
  getHeatLabel,
  getHeatColor,
  searchTerm,
}: {
  groups: LocationGroup[];
  maxCount: number;
  selectedKeys: Set<string>;
  onToggleSelect: (key: string, v: boolean) => void;
  onOpenDetail: (g: LocationGroup) => void;
  getHeatBadge: (count: number) => "default" | "secondary" | "destructive";
  getHeatLabel: (count: number) => string;
  getHeatColor: (count: number) => string;
  searchTerm: string;
}) {
  const cityGroups = useMemo(() => {
    const canon = (v: string | null | undefined) => (v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
    type CityBucket = {
      key: string;
      city: string;
      state: string | null;
      total: number;
      neighborhoods: LocationGroup[];
      cityOnly?: LocationGroup; // entradas sem bairro
    };
    const map = new Map<string, CityBucket>();
    for (const g of groups) {
      const cityKey = canon(g.city);
      if (!map.has(cityKey)) {
        map.set(cityKey, { key: cityKey, city: g.city, state: g.state, total: 0, neighborhoods: [] });
      }
      const bucket = map.get(cityKey)!;
      bucket.total += g.count;
      if (!bucket.state && g.state) bucket.state = g.state;
      if (g.neighborhood) bucket.neighborhoods.push(g);
      else bucket.cityOnly = g;
    }
    const list = Array.from(map.values());
    for (const b of list) b.neighborhoods.sort((a, b2) => b2.count - a.count);
    return list.sort((a, b) => b.total - a.total);
  }, [groups]);

  // Quando o usuário busca algo, abre tudo automaticamente
  const [openCities, setOpenCities] = useState<Set<string>>(new Set());
  const allOpen = useMemo(() => searchTerm.length > 0, [searchTerm]);

  return (
    <div className="space-y-3">
      {cityGroups.map((cg) => {
        const isOpen = allOpen || openCities.has(cg.key);
        const cityVariantWarn = cg.neighborhoods.some((n) => Object.keys(n.neighVariants || {}).length > 1);
        return (
          <Collapsible
            key={cg.key}
            open={isOpen}
            onOpenChange={(o) => {
              setOpenCities((prev) => {
                const next = new Set(prev);
                if (o) next.add(cg.key); else next.delete(cg.key);
                return next;
              });
            }}
          >
            <Card className="overflow-hidden">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                >
                  <Building2 className="w-4 h-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm truncate">{cg.city}</span>
                      {cg.state && <Badge variant="outline" className="h-5 text-[10px] font-mono">{cg.state}</Badge>}
                      {cityVariantWarn && (
                        <span className="text-[10px] text-destructive">⚠ contém variantes</span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {cg.neighborhoods.length} bairro{cg.neighborhoods.length === 1 ? "" : "s"} · {cg.total} pessoa{cg.total === 1 ? "" : "s"}
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-xs shrink-0">{cg.total}</Badge>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="border-t bg-muted/20 p-3 space-y-2">
                  {cg.neighborhoods.length === 0 && cg.cityOnly && (
                    <NeighborhoodCard
                      g={cg.cityOnly}
                      label="Sem bairro especificado"
                      maxCount={maxCount}
                      isSelected={selectedKeys.has(cg.cityOnly.key)}
                      onToggleSelect={onToggleSelect}
                      onOpenDetail={onOpenDetail}
                      getHeatBadge={getHeatBadge}
                      getHeatLabel={getHeatLabel}
                      getHeatColor={getHeatColor}
                    />
                  )}
                  {cg.neighborhoods.length > 0 && (
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {cg.neighborhoods.map((n) => (
                        <NeighborhoodCard
                          key={n.key}
                          g={n}
                          label={n.neighborhood!}
                          maxCount={maxCount}
                          isSelected={selectedKeys.has(n.key)}
                          onToggleSelect={onToggleSelect}
                          onOpenDetail={onOpenDetail}
                          getHeatBadge={getHeatBadge}
                          getHeatLabel={getHeatLabel}
                          getHeatColor={getHeatColor}
                        />
                      ))}
                      {cg.cityOnly && (
                        <NeighborhoodCard
                          g={cg.cityOnly}
                          label="Sem bairro especificado"
                          maxCount={maxCount}
                          isSelected={selectedKeys.has(cg.cityOnly.key)}
                          onToggleSelect={onToggleSelect}
                          onOpenDetail={onOpenDetail}
                          getHeatBadge={getHeatBadge}
                          getHeatLabel={getHeatLabel}
                          getHeatColor={getHeatColor}
                        />
                      )}
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        );
      })}
    </div>
  );
}

function NeighborhoodCard({
  g,
  label,
  maxCount,
  isSelected,
  onToggleSelect,
  onOpenDetail,
  getHeatBadge,
  getHeatLabel,
  getHeatColor,
}: {
  g: LocationGroup;
  label: string;
  maxCount: number;
  isSelected: boolean;
  onToggleSelect: (key: string, v: boolean) => void;
  onOpenDetail: (g: LocationGroup) => void;
  getHeatBadge: (count: number) => "default" | "secondary" | "destructive";
  getHeatLabel: (count: number) => string;
  getHeatColor: (count: number) => string;
}) {
  const variantCount = Object.keys(g.neighVariants || {}).length;
  return (
    <div className={`rounded-lg border bg-card p-3 transition-colors ${isSelected ? "border-primary bg-primary/5" : "hover:border-primary/50"}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <Checkbox
            checked={isSelected}
            onCheckedChange={(v) => onToggleSelect(g.key, !!v)}
            className="mt-0.5"
          />
          <button type="button" onClick={() => onOpenDetail(g)} className="text-left min-w-0 group flex-1">
            <p className="text-sm font-medium truncate group-hover:text-primary">{label}</p>
            {variantCount > 1 && <p className="text-[10px] text-destructive">⚠ {variantCount} variantes</p>}
          </button>
        </div>
        <Badge variant={getHeatBadge(g.count)} className="text-[10px] shrink-0">{getHeatLabel(g.count)}</Badge>
      </div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Users className="w-3 h-3 text-muted-foreground" />
        <span className="text-xs font-bold">{g.count}</span>
        <span className="text-[10px] text-muted-foreground">pessoa{g.count === 1 ? "" : "s"}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${getHeatColor(g.count)}`} style={{ width: `${(g.count / maxCount) * 100}%` }} />
      </div>
    </div>
  );
}

export default function Territorial() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedUF, setSelectedUF] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);

  // Drill-down dialog state
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLevel, setDetailLevel] = useState<"city" | "neighborhood">("city");
  const [detailCity, setDetailCity] = useState<string>("");
  const [detailNeigh, setDetailNeigh] = useState<string | null>(null);

  // Merge selection state
  const [selectedCityNames, setSelectedCityNames] = useState<Set<string>>(new Set());
  const [selectedNeighNames, setSelectedNeighNames] = useState<Set<string>>(new Set());
  const [selectedLocationKeys, setSelectedLocationKeys] = useState<Set<string>>(new Set());
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeField, setMergeField] = useState<"cidade" | "bairro">("cidade");
  const [mergeVariants, setMergeVariants] = useState<Array<{ name: string; count: number }>>([]);
  const [mergeParentCity, setMergeParentCity] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);

  const handleReload = async () => {
    if (reloading) return;
    setReloading(true);
    try {
      // Limpa todos os queries do Territorial e recarrega
      const keys = [
        "client",
        "territorial-supporters",
        "territorial-indicados",
        "recruitment-pessoas",
        "recruitment-contratados",
        "recruitment-indicados",
      ];
      await Promise.all(
        keys.map((k) => queryClient.invalidateQueries({ queryKey: [k] }))
      );
      await queryClient.refetchQueries({ type: "active" });
      toast.success("Dados recarregados");
    } catch (e: any) {
      toast.error("Falha ao recarregar", { description: e?.message });
    } finally {
      setReloading(false);
    }
  };

  const { data: client } = useQuery({
    queryKey: ["client"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      const { data } = await supabase.from("clients").select("id").eq("user_id", user.id).maybeSingle();
      return data;
    },
  });

  // ── Supporter accounts (territorial) ──
  const { data: supporters } = useQuery({
    queryKey: ["territorial-supporters", client?.id],
    queryFn: async () => {
      if (!client?.id) return [];
      const { data } = await supabase.from("supporter_accounts").select("id, name, phone, cpf, supporter_id, city, neighborhood, state, created_at").eq("client_id", client.id);
      return (data || []) as Array<{ id: string; name: string; phone: string | null; cpf: string | null; supporter_id: string | null; city: string | null; neighborhood: string | null; state: string | null; created_at: string }>;
    },
    enabled: !!client?.id,
  });

  const { data: confirmedIndicados } = useQuery({
    queryKey: ["territorial-indicados", client?.id],
    queryFn: async () => {
      if (!client?.id) return [];
      const { data } = await supabase.from("contratado_indicados").select("id, nome, telefone, cidade, bairro, created_at").eq("client_id", client.id).eq("status", "confirmado");
      return (data || []) as Array<{ id: string; nome: string; telefone: string | null; cidade: string | null; bairro: string | null; created_at: string }>;
    },
    enabled: !!client?.id,
  });

  // ── All pessoas (recruitment) ──
  const { data: allPessoas, isLoading: pessoasLoading } = useQuery({
    queryKey: ["recruitment-pessoas", client?.id],
    queryFn: async () => {
      if (!client?.id) return [];
      const PAGE = 1000;
      const result: PessoaRow[] = [];
      let from = 0;
      while (true) {
        const { data } = await supabase.from("pessoas").select("id, nome, cidade, bairro, telefone, cpf, supporter_id, tipo_pessoa, origem_contato, created_at").eq("client_id", client.id).order("created_at", { ascending: false }).range(from, from + PAGE - 1);
        if (!data || data.length === 0) break;
        result.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      return result;
    },
    enabled: !!client?.id,
  });

  const { data: contratadoRows } = useQuery({
    queryKey: ["recruitment-contratados", client?.id],
    queryFn: async () => {
      if (!client?.id) return [];
      const PAGE = 1000;
      const result: PessoaRow[] = [];
      let from = 0;
      while (true) {
        const { data } = await supabase.from("contratados").select("id, nome, cidade, bairro, telefone, cpf, is_lider, created_at").eq("client_id", client.id).order("created_at", { ascending: false }).range(from, from + PAGE - 1);
        if (!data || data.length === 0) break;
        for (const c of data) {
          result.push({ id: c.id, nome: c.nome, cidade: c.cidade, bairro: c.bairro, telefone: c.telefone, cpf: c.cpf, tipo_pessoa: c.is_lider ? "lider" : "contratado", origem_contato: "formulario", created_at: c.created_at });
        }
        if (data.length < PAGE) break;
        from += PAGE;
      }
      return result;
    },
    enabled: !!client?.id,
  });

  const { data: indicadoRows } = useQuery({
    queryKey: ["recruitment-indicados", client?.id],
    queryFn: async () => {
      if (!client?.id) return [];
      const PAGE = 1000;
      const result: PessoaRow[] = [];
      let from = 0;
      while (true) {
        const { data } = await supabase.from("contratado_indicados").select("id, nome, cidade, bairro, telefone, created_at").eq("client_id", client.id).order("created_at", { ascending: false }).range(from, from + PAGE - 1);
        if (!data || data.length === 0) break;
        for (const ind of data) {
          result.push({ id: ind.id, nome: ind.nome, cidade: ind.cidade, bairro: ind.bairro, telefone: ind.telefone, tipo_pessoa: "indicado", origem_contato: "formulario", created_at: ind.created_at });
        }
        if (data.length < PAGE) break;
        from += PAGE;
      }
      return result;
    },
    enabled: !!client?.id,
  });

  // ═══════════════════════════════════════
  // TERRITORIAL computed (uma pessoa só: CRM + Apoiador/Contratado/Indicado não duplicam)
  // ═══════════════════════════════════════
  type GeoEntry = { id: string; name: string | null; phone: string | null; cpf?: string | null; supporter_id?: string | null; city: string | null; neighborhood: string | null; state: string | null; created_at: string };

  const allGeoEntries = useMemo<GeoEntry[]>(() => {
    const entries: GeoEntry[] = [];
    (allPessoas || []).forEach(p => entries.push({ id: `pessoa:${p.id}`, name: p.nome, phone: p.telefone, cpf: p.cpf, supporter_id: p.supporter_id, city: p.cidade, neighborhood: p.bairro, state: null, created_at: p.created_at }));
    (supporters || []).forEach(s => entries.push({ id: `supporter:${s.id}`, name: s.name, phone: s.phone, cpf: s.cpf, supporter_id: s.supporter_id, city: s.city, neighborhood: s.neighborhood, state: s.state, created_at: s.created_at }));
    (confirmedIndicados || []).forEach(i => entries.push({ id: `indicado:${i.id}`, name: i.nome, phone: i.telefone, city: i.cidade, neighborhood: i.bairro, state: null, created_at: i.created_at }));
    return dedupeByPerson(entries);
  }, [supporters, confirmedIndicados, allPessoas]);

  // Heuristic: infer UF from explicit state field, or "Cidade - UF" / "Cidade/UF" suffix in city.
  const inferUF = (e: GeoEntry): string | null => {
    const fromState = resolveUF(e.state);
    if (fromState) return fromState;
    if (e.city) {
      const m = e.city.match(/[\s,/-]+([A-Za-z]{2})\s*$/);
      if (m) {
        const uf = resolveUF(m[1]);
        if (uf) return uf;
      }
    }
    return null;
  };

  // UF aggregation for the map
  const ufCounts = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const e of allGeoEntries) {
      const uf = inferUF(e);
      if (uf) map[uf] = (map[uf] || 0) + 1;
    }
    return map;
  }, [allGeoEntries]);

  const totalWithUF = useMemo(() => Object.values(ufCounts).reduce((a, b) => a + b, 0), [ufCounts]);
  const ufWithData = useMemo(() => Object.keys(ufCounts).length, [ufCounts]);

  // City/neighborhood aggregation, optionally filtered by selected UF
  const { groups, totalWithLocation, totalWithout } = useMemo(() => {
    const filtered = selectedUF
      ? allGeoEntries.filter(e => inferUF(e) === selectedUF)
      : allGeoEntries;
    const withLoc = filtered.filter(s => s.city || s.neighborhood);
    const withoutLoc = filtered.filter(s => !s.city && !s.neighborhood);
    // Canonical key: lowercase + sem acento + espaços colapsados (defensivo p/ dados antigos)
    const canon = (v: string | null | undefined) => {
      if (!v) return "";
      return v
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
    };
    // Acumula contagem por chave canônica e mantém variantes de nome para escolher a mais frequente
    type Bucket = LocationGroup & { cityVariants: Record<string, number>; neighVariants: Record<string, number> };
    const map: Record<string, Bucket> = {};
    for (const s of withLoc) {
      const cityRaw = (s.city?.trim()) || "Sem cidade";
      const cityClean = cityRaw.replace(/[\s,/-]+[A-Za-z]{2}\s*$/, "").trim() || cityRaw;
      const neighRaw = s.neighborhood?.trim() || null;
      const cityKey = canon(cityClean);
      const neighKey = canon(neighRaw);
      const key = `${cityKey}||${neighKey}`;
      if (!map[key]) {
        map[key] = {
          key,
          city: cityClean,
          neighborhood: neighRaw,
          state: inferUF(s),
          count: 0,
          cityVariants: {},
          neighVariants: {},
        };
      }
      map[key].count++;
      map[key].cityVariants[cityClean] = (map[key].cityVariants[cityClean] || 0) + 1;
      if (neighRaw) {
        map[key].neighVariants[neighRaw] = (map[key].neighVariants[neighRaw] || 0) + 1;
      }
    }
    // Escolhe a variante de display mais frequente (preserva acentos/capitalização "boa")
    const pickBest = (variants: Record<string, number>) => {
      const entries = Object.entries(variants);
      if (entries.length === 0) return null;
      entries.sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
      return entries[0][0];
    };
    const result: LocationGroup[] = Object.values(map).map(b => ({
      key: b.key,
      city: pickBest(b.cityVariants) || b.city,
      neighborhood: pickBest(b.neighVariants),
      state: b.state,
      count: b.count,
      cityVariants: b.cityVariants,
      neighVariants: b.neighVariants,
    }));
    return { groups: result.sort((a, b) => b.count - a.count), totalWithLocation: withLoc.length, totalWithout: withoutLoc.length };
  }, [allGeoEntries, selectedUF]);

  // City-only aggregation for selected UF (drill-down level 2)
  // Mantém variantes brutas (com casing/acento original) por chave canônica
  // para permitir mesclagem manual de duplicatas escritas diferente.
  const cityGroups = useMemo(() => {
    const canon = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
    const filtered = selectedUF
      ? allGeoEntries.filter((e) => inferUF(e) === selectedUF)
      : allGeoEntries;
    type B = { city: string; count: number; variants: Record<string, number> };
    const map: Record<string, B> = {};
    for (const e of filtered) {
      const cityRaw = (e.city?.trim()) || "";
      if (!cityRaw) continue;
      const cityClean = cityRaw.replace(/[\s,/-]+[A-Za-z]{2}\s*$/, "").trim() || cityRaw;
      const key = canon(cityClean);
      if (!map[key]) map[key] = { city: cityClean, count: 0, variants: {} };
      map[key].count++;
      map[key].variants[cityClean] = (map[key].variants[cityClean] || 0) + 1;
    }
    return Object.values(map)
      .map((b) => {
        const top = Object.entries(b.variants).sort((a, b2) => b2[1] - a[1])[0];
        return { city: top ? top[0] : b.city, count: b.count, variants: b.variants };
      })
      .sort((a, b) => b.count - a.count);
  }, [allGeoEntries, selectedUF]);

  // Neighborhoods of selected city (drill-down level 3)
  const neighborhoodGroups = useMemo(() => {
    if (!selectedCity) return [];
    const canon = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
    const cityKey = canon(selectedCity);
    const filtered = selectedUF
      ? allGeoEntries.filter((e) => inferUF(e) === selectedUF)
      : allGeoEntries;
    type B = { key: string; neighborhood: string; count: number; variants: Record<string, number> };
    const map: Record<string, B> = {};
    for (const e of filtered) {
      const cityRaw = (e.city?.trim()) || "";
      const cityClean = cityRaw.replace(/[\s,/-]+[A-Za-z]{2}\s*$/, "").trim() || cityRaw;
      if (canon(cityClean) !== cityKey) continue;
      const neighRaw = e.neighborhood?.trim();
      if (!neighRaw) continue;
      const nk = canon(neighRaw);
      if (!map[nk]) map[nk] = { key: nk, neighborhood: neighRaw, count: 0, variants: {} };
      map[nk].count++;
      map[nk].variants[neighRaw] = (map[nk].variants[neighRaw] || 0) + 1;
    }
    return Object.values(map)
      .map((b) => {
        const top = Object.entries(b.variants).sort((a, b2) => b2[1] - a[1])[0];
        return { key: b.key, neighborhood: top ? top[0] : b.neighborhood, count: b.count, variants: b.variants };
      })
      .sort((a, b) => b.count - a.count);
  }, [allGeoEntries, selectedUF, selectedCity]);

  const growthStats = useMemo(() => {
    if (!allGeoEntries) return null;
    const now = Date.now();
    const d30 = 30 * 24 * 60 * 60 * 1000;
    const withLoc = allGeoEntries.filter(s => s.city || s.neighborhood);
    const last30 = withLoc.filter(s => now - new Date(s.created_at).getTime() < d30).length;
    const prev30 = withLoc.filter(s => { const diff = now - new Date(s.created_at).getTime(); return diff >= d30 && diff < d30 * 2; }).length;
    const change = prev30 > 0 ? Math.round(((last30 - prev30) / prev30) * 100) : last30 > 0 ? 100 : 0;
    return { last30, prev30, change };
  }, [allGeoEntries]);

  const maxCount = groups.length > 0 ? groups[0].count : 1;

  const geoChartData = useMemo(() => {
    return groups.slice(0, 15).map(g => ({
      name: g.neighborhood ? `${g.neighborhood}` : g.city,
      fullName: g.neighborhood ? `${g.neighborhood}, ${g.city}` : g.city,
      count: g.count,
      ratio: g.count / maxCount,
    }));
  }, [groups, maxCount]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const base = term
      ? groups.filter(g => g.city.toLowerCase().includes(term) || (g.neighborhood?.toLowerCase().includes(term)))
      : groups;

    // Evita exibir a cidade como se fosse um bairro quando a mesma cidade já tem bairros listados.
    // Ex.: em Campo Grande, mostra Santa Emília, Aero Rancho etc., mas não um card "Campo Grande" no meio.
    const citiesWithNeighborhoods = new Set(
      base.filter((g) => !!g.neighborhood).map((g) => canonPerson(cleanCity(g.city)))
    );

    return base.filter((g) => {
      if (g.neighborhood) return true;
      return !citiesWithNeighborhoods.has(canonPerson(cleanCity(g.city)));
    });
  }, [groups, search]);

  const selectedLocations = useMemo(
    () => groups.filter((g) => selectedLocationKeys.has(g.key)),
    [groups, selectedLocationKeys],
  );

  const openLocationDetail = (g: LocationGroup) => {
    setDetailLevel(g.neighborhood ? "neighborhood" : "city");
    setDetailCity(g.city);
    setDetailNeigh(g.neighborhood);
    setDetailOpen(true);
  };

  const openSelectedLocationsMerge = () => {
    const allAreNeighborhoods = selectedLocations.length > 0 && selectedLocations.every((g) => !!g.neighborhood);
    const parentCity = allAreNeighborhoods ? selectedLocations[0]?.city || null : null;
    const variants = selectedLocations.map((g) => ({
      name: allAreNeighborhoods ? g.neighborhood! : g.city,
      count: g.count,
    }));
    setMergeVariants(variants);
    setMergeField(allAreNeighborhoods ? "bairro" : "cidade");
    setMergeParentCity(parentCity);
    setMergeOpen(true);
  };

  const getHeatColor = (count: number) => { const r = count / maxCount; return r >= 0.7 ? "bg-primary" : r >= 0.4 ? "bg-accent-foreground/50" : "bg-destructive"; };
  const getHeatLabel = (count: number) => { const r = count / maxCount; return r >= 0.7 ? "Zona Quente" : r >= 0.4 ? "Zona Morna" : "Zona Fria"; };
  const getHeatBadge = (count: number): "default" | "secondary" | "destructive" => { const r = count / maxCount; return r >= 0.7 ? "default" : r >= 0.4 ? "secondary" : "destructive"; };

  // ═══════════════════════════════════════
  // RECRUITMENT computed
  // ═══════════════════════════════════════
  const mergedPessoas = useMemo(() => {
    const source = [...(allPessoas || []), ...(contratadoRows || []), ...(indicadoRows || [])];
    const merged = dedupeByPerson(source.map((p) => ({
      ...p,
      name: p.nome,
      phone: p.telefone,
      city: p.cidade,
      neighborhood: p.bairro,
    }))).map((p) => ({
      id: p.id,
      nome: p.nome,
      cidade: p.cidade,
      bairro: p.bairro,
      telefone: p.telefone,
      cpf: p.cpf,
      supporter_id: p.supporter_id,
      tipo_pessoa: p.tipo_pessoa,
      origem_contato: p.origem_contato,
      created_at: p.created_at,
    }));
    merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return merged;
  }, [allPessoas, contratadoRows, indicadoRows]);

  const now = useMemo(() => new Date(), []);
  const todayStart = useMemo(() => startOfDay(now), [now]);
  const weekAgo = useMemo(() => subDays(todayStart, 7), [todayStart]);
  const monthAgo = useMemo(() => subDays(todayStart, 30), [todayStart]);

  const recruitMetrics = useMemo(() => {
    const total = mergedPessoas.length;
    const today = mergedPessoas.filter(p => isAfter(parseISO(p.created_at), todayStart)).length;
    const week = mergedPessoas.filter(p => isAfter(parseISO(p.created_at), weekAgo)).length;
    const month = mergedPessoas.filter(p => isAfter(parseISO(p.created_at), monthAgo)).length;
    return { total, today, week, month };
  }, [mergedPessoas, todayStart, weekAgo, monthAgo]);

  const dailyChartData = useMemo(() => {
    const days: { date: string; label: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = subDays(todayStart, i);
      days.push({ date: format(d, "yyyy-MM-dd"), label: format(d, "dd/MM"), count: 0 });
    }
    mergedPessoas.forEach(p => {
      const key = format(parseISO(p.created_at), "yyyy-MM-dd");
      const day = days.find(d => d.date === key);
      if (day) day.count++;
    });
    return days;
  }, [mergedPessoas, todayStart]);

  const origemData = useMemo(() => {
    const map: Record<string, number> = {};
    mergedPessoas.forEach(p => { map[p.origem_contato] = (map[p.origem_contato] || 0) + 1; });
    const labels: Record<string, string> = { formulario: "Formulário Público", manual: "Cadastro Manual", rede_social: "Rede Social", evento: "Evento", importacao: "Importação" };
    return Object.entries(map).map(([key, count]) => ({ name: labels[key] || key, count })).sort((a, b) => b.count - a.count);
  }, [mergedPessoas]);

  const recentPessoas = useMemo(() => mergedPessoas.slice(0, 20), [mergedPessoas]);
  const maxDailyChart = Math.max(...dailyChartData.map(d => d.count), 1);

  const tipoLabels: Record<string, string> = {
    eleitor: "Eleitor", apoiador: "Apoiador", lideranca: "Liderança", voluntario: "Voluntário",
    cidadao: "Cidadão", jornalista: "Jornalista", influenciador: "Influenciador", adversario: "Adversário",
    lider: "Líder", contratado: "Contratado", indicado: "Indicado", liderado: "Liderado",
  };

  const coldZones = groups.filter(g => g.count / maxCount < 0.4).length;

  // Region aggregation (Norte / Nordeste / etc.)
  const regionCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const [uf, count] of Object.entries(ufCounts)) {
      const region = ufRegion(uf);
      map[region] = (map[region] || 0) + count;
    }
    return Object.entries(map).map(([region, count]) => ({ region, count })).sort((a, b) => b.count - a.count);
  }, [ufCounts]);

  const topUFs = useMemo(() => {
    return Object.entries(ufCounts)
      .map(([uf, count]) => ({ uf, name: ufName(uf), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [ufCounts]);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <MapPin className="w-7 h-7 text-primary" />
            Base & Território
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl mt-1">
            Visão unificada de <strong>quantas pessoas você tem</strong> (crescimento) e <strong>onde elas estão no Brasil</strong> (geografia).
            Mapa interativo por estado, drill-down em cidades e bairros — pronto para campanhas em qualquer região do país.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleReload}
          disabled={reloading}
          className="shrink-0"
        >
          <RefreshCw className={`w-4 h-4 mr-1.5 ${reloading ? "animate-spin" : ""}`} />
          {reloading ? "Recarregando…" : "Recarregar dados"}
        </Button>
      </div>

      {/* ═══════════════════════════════════════ */}
      {/* CRESCIMENTO DA BASE                    */}
      {/* ═══════════════════════════════════════ */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Crescimento da Base
          </h2>
          <p className="text-xs text-muted-foreground">
            Quantos cadastros novos você está recebendo? Acompanhe a evolução diária e identifique quais canais estão trazendo mais pessoas.
          </p>
        </div>

        {pessoasLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard icon={Users} label="Total de cadastros" value={recruitMetrics.total} description="Todas as pessoas no sistema" />
              <MetricCard icon={UserPlus} label="Hoje" value={recruitMetrics.today} accent description="Cadastros feitos hoje" />
              <MetricCard icon={CalendarDays} label="Últimos 7 dias" value={recruitMetrics.week} description="Novos na última semana" />
              <MetricCard icon={TrendingUp} label="Últimos 30 dias" value={recruitMetrics.month} description="Novos no último mês" />
            </div>

            {/* Daily chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="w-5 h-5 text-primary" />Cadastros por Dia</CardTitle>
                <CardDescription className="text-xs">Últimos 30 dias — cada barra mostra quantas pessoas foram cadastradas naquele dia, de qualquer origem.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64 md:h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyChartData} margin={{ top: 5, right: 5, bottom: 20, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={typeof window !== "undefined" && window.innerWidth < 768 ? 3 : 1} angle={-45} textAnchor="end" height={50} className="fill-muted-foreground" />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} className="fill-muted-foreground" />
                      <Tooltip contentStyle={{ borderRadius: 8, fontSize: 13, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))" }} labelFormatter={(l) => `Dia ${l}`} formatter={(v: number) => [`${v} cadastros`, "Cadastros"]} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={28}>
                        {dailyChartData.map((entry, i) => (
                          <Cell key={i} fill={entry.count === 0 ? "hsl(var(--muted))" : entry.count >= maxDailyChart * 0.7 ? "hsl(var(--primary))" : "hsl(var(--primary) / 0.6)"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Origem */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4 text-primary" />De onde vêm os cadastros?</CardTitle>
                <CardDescription className="text-xs">Distribuição por canal de origem — mostra se as pessoas estão chegando por formulário público, cadastro manual, redes sociais, etc.</CardDescription>
              </CardHeader>
              <CardContent>
                {origemData.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum dado</p>
                ) : (
                  <div className="space-y-2">
                    {origemData.map((o) => <DistributionRow key={o.name} label={o.name} count={o.count} total={recruitMetrics.total} />)}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Divider */}
      <div className="border-t" />

      {/* ═══════════════════════════════════════ */}
      {/* MAPA TERRITORIAL                       */}
      {/* ═══════════════════════════════════════ */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" />
            Mapa de Influência
          </h2>
          <p className="text-xs text-muted-foreground">
            Cobertura nacional: o mapa do Brasil colore os estados conforme a concentração de pessoas cadastradas.
            <strong> Clique em um estado</strong> para filtrar cidades e bairros abaixo.
          </p>
        </div>

        {/* Stats nacionais */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Card><CardContent className="pt-4 pb-3 px-4"><p className="text-xs text-muted-foreground">Estados ativos</p><p className="text-2xl font-bold text-primary">{ufWithData}<span className="text-sm text-muted-foreground font-normal">/27</span></p><p className="text-[10px] text-muted-foreground">Com pelo menos 1 cadastro</p></CardContent></Card>
          <Card><CardContent className="pt-4 pb-3 px-4"><p className="text-xs text-muted-foreground">Pessoas geolocalizadas</p><p className="text-2xl font-bold">{totalWithUF.toLocaleString("pt-BR")}</p><p className="text-[10px] text-muted-foreground">Com estado identificado</p></CardContent></Card>
          <Card><CardContent className="pt-4 pb-3 px-4"><p className="text-xs text-muted-foreground">Cidades distintas</p><p className="text-2xl font-bold">{cityGroups.length}</p><p className="text-[10px] text-muted-foreground">{selectedUF ? `Em ${selectedUF}` : "No total"}</p></CardContent></Card>
          <Card><CardContent className="pt-4 pb-3 px-4"><p className="text-xs text-muted-foreground">Sem localização</p><p className="text-2xl font-bold text-muted-foreground">{totalWithout.toLocaleString("pt-BR")}</p><p className="text-[10px] text-muted-foreground">Não preencheram</p></CardContent></Card>
          <Card className="col-span-2 sm:col-span-1">
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-muted-foreground">Crescimento 30d</p>
              <div className="flex items-center gap-1">
                <p className="text-2xl font-bold">{growthStats?.last30 || 0}</p>
                {growthStats && growthStats.change !== 0 && (
                  <Badge variant={growthStats.change > 0 ? "default" : "destructive"} className="text-[10px] px-1.5 h-5">
                    {growthStats.change > 0 ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
                    {growthStats.change > 0 ? "+" : ""}{growthStats.change}%
                  </Badge>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">vs {growthStats?.prev30 || 0} mês anterior</p>
            </CardContent>
          </Card>
        </div>

        {/* Mapa do Brasil + sidebar */}
        <div className="grid lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><Globe2 className="w-4 h-4 text-primary" />Distribuição por Estado</CardTitle>
              <CardDescription className="text-xs">Mapa interativo. Passe o mouse para detalhes, clique para filtrar cidades.</CardDescription>
            </CardHeader>
            <CardContent>
              {totalWithUF === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Globe2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="font-medium text-sm">Nenhum estado identificado ainda</p>
                  <p className="text-xs mt-1">Cadastre apoiadores no portal com o campo <strong>estado</strong> preenchido para ver o mapa colorido.</p>
                </div>
              ) : (
                <BrazilMap data={ufCounts} selectedUF={selectedUF} onSelectUF={(uf) => { setSelectedUF(uf); setSelectedCity(null); }} />
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4 text-primary" />Por Região</CardTitle>
              </CardHeader>
              <CardContent>
                {regionCounts.length === 0 ? <p className="text-xs text-muted-foreground">Sem dados</p> : (
                  <div className="space-y-2">
                    {regionCounts.map((r) => <DistributionRow key={r.region} label={r.region} count={r.count} total={totalWithUF} />)}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" />Top 10 Estados</CardTitle>
              </CardHeader>
              <CardContent>
                {topUFs.length === 0 ? <p className="text-xs text-muted-foreground">Sem dados</p> : (
                  <div className="space-y-1">
                    {topUFs.map((s, i) => (
                      <button
                        key={s.uf}
                        onClick={() => { setSelectedUF(selectedUF === s.uf ? null : s.uf); setSelectedCity(null); }}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors ${selectedUF === s.uf ? "bg-primary/10 border border-primary/30" : "hover:bg-muted"}`}
                      >
                        <span className="text-muted-foreground w-4 text-right">{i + 1}</span>
                        <Badge variant="outline" className="h-5 text-[10px] font-mono">{s.uf}</Badge>
                        <span className="flex-1 text-left truncate">{s.name}</span>
                        <span className="font-bold">{s.count.toLocaleString("pt-BR")}</span>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Drill-down breadcrumb */}
        {(selectedUF || selectedCity) && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="py-3 px-4 flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Filtrando:</span>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setSelectedUF(null); setSelectedCity(null); }}>
                <Globe2 className="w-3 h-3 mr-1" /> Brasil
              </Button>
              {selectedUF && (
                <>
                  <span className="text-muted-foreground">/</span>
                  <Button variant={selectedCity ? "ghost" : "secondary"} size="sm" className="h-7 text-xs" onClick={() => setSelectedCity(null)}>
                    <Building2 className="w-3 h-3 mr-1" /> {ufName(selectedUF)} ({selectedUF})
                  </Button>
                </>
              )}
              {selectedCity && (
                <>
                  <span className="text-muted-foreground">/</span>
                  <Badge variant="secondary" className="h-7 px-2 text-xs gap-1"><Home className="w-3 h-3" />{selectedCity}</Badge>
                </>
              )}
              <Button variant="ghost" size="sm" className="h-7 ml-auto text-xs" onClick={() => { setSelectedUF(null); setSelectedCity(null); }}>
                <X className="w-3 h-3 mr-1" /> Limpar
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Cidades do estado selecionado */}
        {selectedUF && !selectedCity && cityGroups.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <CardTitle className="text-base flex items-center gap-2"><Building2 className="w-4 h-4 text-primary" />Cidades em {ufName(selectedUF)}</CardTitle>
                  <CardDescription className="text-xs">Clique no nome para ver as pessoas. Marque 2+ para mesclar duplicados.</CardDescription>
                </div>
                {selectedCityNames.size >= 2 && (
                  <Button
                    size="sm"
                    onClick={() => {
                      const variants = cityGroups
                        .filter((c) => selectedCityNames.has(c.city))
                        .flatMap((c) => Object.entries(c.variants).map(([name, count]) => ({ name, count })));
                      // Agrega variantes com mesmo nome literal
                      const agg: Record<string, number> = {};
                      for (const v of variants) agg[v.name] = (agg[v.name] || 0) + v.count;
                      setMergeVariants(Object.entries(agg).map(([name, count]) => ({ name, count })));
                      setMergeField("cidade");
                      setMergeParentCity(null);
                      setMergeOpen(true);
                    }}
                  >
                    <Merge className="w-4 h-4 mr-1.5" /> Mesclar {selectedCityNames.size} cidades
                  </Button>
                )}
                {selectedCityNames.size > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => setSelectedCityNames(new Set())}>
                    <X className="w-3.5 h-3.5 mr-1" /> Limpar seleção
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {cityGroups.map((c) => {
                  const ratio = c.count / (cityGroups[0]?.count || 1);
                  const isSelected = selectedCityNames.has(c.city);
                  const variantCount = Object.keys(c.variants).length;
                  return (
                    <div
                      key={c.city}
                      className={`p-3 rounded-lg border transition-colors ${isSelected ? "border-primary bg-primary/5" : "hover:border-primary/50"}`}
                    >
                      <div className="flex items-start gap-2 mb-1.5">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(v) => {
                            setSelectedCityNames((prev) => {
                              const next = new Set(prev);
                              if (v) next.add(c.city); else next.delete(c.city);
                              return next;
                            });
                          }}
                          className="mt-0.5"
                        />
                        <button
                          onClick={() => {
                            setDetailLevel("city");
                            setDetailCity(c.city);
                            setDetailNeigh(null);
                            setDetailOpen(true);
                          }}
                          className="flex-1 text-left min-w-0 group"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium truncate group-hover:text-primary">{c.city}</span>
                            <span className="text-sm font-bold shrink-0">{c.count}</span>
                          </div>
                          {variantCount > 1 && (
                            <p className="text-[10px] text-destructive mt-0.5">⚠ {variantCount} variantes</p>
                          )}
                        </button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[10px]"
                          onClick={() => setSelectedCity(c.city)}
                        >
                          Bairros →
                        </Button>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${Math.max(ratio * 100, 3)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Bairros da cidade selecionada */}
        {selectedCity && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <CardTitle className="text-base flex items-center gap-2"><Home className="w-4 h-4 text-primary" />Bairros em {selectedCity}</CardTitle>
                  <CardDescription className="text-xs">
                    {neighborhoodGroups.length === 0
                      ? "Nenhum bairro detalhado para esta cidade."
                      : `${neighborhoodGroups.length} bairros. Clique no nome para ver as pessoas. Marque 2+ para mesclar.`}
                  </CardDescription>
                </div>
                {selectedNeighNames.size >= 2 && (
                  <Button
                    size="sm"
                    onClick={() => {
                      const variants = neighborhoodGroups
                        .filter((g) => selectedNeighNames.has(g.neighborhood))
                        .flatMap((g) => Object.entries(g.variants).map(([name, count]) => ({ name, count })));
                      const agg: Record<string, number> = {};
                      for (const v of variants) agg[v.name] = (agg[v.name] || 0) + v.count;
                      setMergeVariants(Object.entries(agg).map(([name, count]) => ({ name, count })));
                      setMergeField("bairro");
                      setMergeParentCity(selectedCity);
                      setMergeOpen(true);
                    }}
                  >
                    <Merge className="w-4 h-4 mr-1.5" /> Mesclar {selectedNeighNames.size} bairros
                  </Button>
                )}
                {selectedNeighNames.size > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => setSelectedNeighNames(new Set())}>
                    <X className="w-3.5 h-3.5 mr-1" /> Limpar
                  </Button>
                )}
              </div>
            </CardHeader>
            {neighborhoodGroups.length > 0 && (
              <CardContent>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {neighborhoodGroups.map((g) => {
                    const isSelected = selectedNeighNames.has(g.neighborhood);
                    const variantCount = Object.keys(g.variants).length;
                    return (
                      <div
                        key={g.key}
                        className={`p-3 rounded-lg border transition-colors ${isSelected ? "border-primary bg-primary/5" : ""}`}
                      >
                        <div className="flex items-start gap-2 mb-1.5">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(v) => {
                              setSelectedNeighNames((prev) => {
                                const next = new Set(prev);
                                if (v) next.add(g.neighborhood); else next.delete(g.neighborhood);
                                return next;
                              });
                            }}
                            className="mt-0.5"
                          />
                          <button
                            onClick={() => {
                              setDetailLevel("neighborhood");
                              setDetailCity(selectedCity);
                              setDetailNeigh(g.neighborhood);
                              setDetailOpen(true);
                            }}
                            className="flex-1 text-left min-w-0 group"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium truncate group-hover:text-primary">{g.neighborhood}</span>
                              <Badge variant={getHeatBadge(g.count)} className="text-[10px] shrink-0">{g.count}</Badge>
                            </div>
                            {variantCount > 1 && (
                              <p className="text-[10px] text-destructive mt-0.5">⚠ {variantCount} variantes</p>
                            )}
                          </button>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${getHeatColor(g.count)}`} style={{ width: `${(g.count / maxCount) * 100}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            )}
          </Card>
        )}

        {/* Top regiões (gráfico — todas as regiões, sem filtro) */}
        {!selectedUF && geoChartData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="w-4 h-4 text-primary" />Top Cidades/Bairros — Brasil</CardTitle>
              <CardDescription className="text-xs">As {geoChartData.length} localidades com mais cadastros em todo o país. A cor indica a intensidade relativa.</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={{ count: { label: "Apoiadores", color: "hsl(var(--primary))" } }} className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={geoChartData} layout="vertical" margin={{ left: 0, right: 16, top: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} width={120} tick={{ fill: "hsl(var(--foreground))" }} />
                    <ChartTooltip content={<ChartTooltipContent />} formatter={(value: number, _name: string, props: any) => [`${value} apoiadores`, props.payload.fullName]} />
                    <Bar dataKey="count" name="Apoiadores" radius={[0, 4, 4, 0]}>
                      {geoChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.ratio >= 0.7 ? "hsl(var(--primary))" : entry.ratio >= 0.4 ? "hsl(38, 92%, 50%)" : "hsl(var(--destructive))"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder={selectedUF ? `Buscar cidade/bairro em ${selectedUF}...` : "Buscar por cidade ou bairro em todo o Brasil..."} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>

        {/* Cold zones alert */}
        {coldZones > 0 && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="pt-4 pb-3 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm">Zonas frias identificadas</p>
                <p className="text-xs text-muted-foreground">{coldZones} regiões com poucos apoiadores — são oportunidades de expansão para ações de campo</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Territory cards */}
        {filtered.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground"><MapPin className="w-10 h-10 mx-auto mb-3 opacity-30" /><p className="font-medium">Nenhum dado territorial disponível</p><p className="text-xs mt-1">Os apoiadores precisam informar cidade/bairro no cadastro do portal</p></CardContent></Card>
        ) : (
          <div className="space-y-3">
            {selectedLocationKeys.size > 0 && (
              <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2">
                <span className="text-xs text-muted-foreground">
                  {selectedLocationKeys.size} localidade{selectedLocationKeys.size === 1 ? "" : "s"} selecionada{selectedLocationKeys.size === 1 ? "" : "s"}
                </span>
                <div className="flex items-center gap-2">
                  {selectedLocationKeys.size >= 2 && (
                    <Button size="sm" onClick={openSelectedLocationsMerge}>
                      <Merge className="w-4 h-4 mr-1.5" /> Mesclar selecionados
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setSelectedLocationKeys(new Set())}>
                    <X className="w-3.5 h-3.5 mr-1" /> Limpar
                  </Button>
                </div>
              </div>
            )}
            <CityGroupedList
              groups={filtered}
              maxCount={maxCount}
              selectedKeys={selectedLocationKeys}
              onToggleSelect={(key, v) =>
                setSelectedLocationKeys((prev) => {
                  const next = new Set(prev);
                  if (v) next.add(key); else next.delete(key);
                  return next;
                })
              }
              onOpenDetail={openLocationDetail}
              getHeatBadge={getHeatBadge}
              getHeatLabel={getHeatLabel}
              getHeatColor={getHeatColor}
              searchTerm={search.trim()}
            />
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="border-t" />

      {/* ═══════════════════════════════════════ */}
      {/* ÚLTIMOS CADASTROS                      */}
      {/* ═══════════════════════════════════════ */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            Últimos Cadastros
          </h2>
          <p className="text-xs text-muted-foreground">
            As 20 pessoas mais recentes registradas no sistema, independente da origem (formulário, manual, contratado, indicado).
          </p>
        </div>

        <Card>
          <CardContent className="pt-4">
            {recentPessoas.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Nenhum cadastro encontrado.</p>
            ) : (
              <div className="overflow-x-auto -mx-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 pl-6 font-medium text-muted-foreground">Nome</th>
                      <th className="pb-2 font-medium text-muted-foreground hidden sm:table-cell">Cidade</th>
                      <th className="pb-2 font-medium text-muted-foreground hidden md:table-cell">Telefone</th>
                      <th className="pb-2 font-medium text-muted-foreground hidden md:table-cell">Tipo</th>
                      <th className="pb-2 pr-6 font-medium text-muted-foreground text-right">Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentPessoas.map((p) => (
                      <tr key={p.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                        <td className="py-2.5 pl-6 font-medium">{p.nome}</td>
                        <td className="py-2.5 text-muted-foreground hidden sm:table-cell">{p.cidade || "—"}</td>
                        <td className="py-2.5 text-muted-foreground hidden md:table-cell font-mono text-xs">{p.telefone || "—"}</td>
                        <td className="py-2.5 hidden md:table-cell">
                          <Badge variant="secondary" className="text-xs">{tipoLabels[p.tipo_pessoa] || p.tipo_pessoa}</Badge>
                        </td>
                        <td className="py-2.5 pr-6 text-right text-muted-foreground text-xs">
                          {format(parseISO(p.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialogs */}
      <LocalityDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        clientId={client?.id || null}
        level={detailLevel}
        city={detailCity}
        neighborhood={detailNeigh}
      />
      <MergeLocalitiesDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        clientId={client?.id || null}
        field={mergeField}
        variants={mergeVariants}
        parentCity={mergeParentCity}
        onSuccess={() => {
          setSelectedCityNames(new Set());
          setSelectedNeighNames(new Set());
          queryClient.invalidateQueries({ queryKey: ["territorial-supporters", client?.id] });
          queryClient.invalidateQueries({ queryKey: ["territorial-indicados", client?.id] });
          queryClient.invalidateQueries({ queryKey: ["recruitment-pessoas", client?.id] });
          queryClient.invalidateQueries({ queryKey: ["recruitment-contratados", client?.id] });
          queryClient.invalidateQueries({ queryKey: ["recruitment-indicados", client?.id] });
        }}
      />
    </div>
  );
}
