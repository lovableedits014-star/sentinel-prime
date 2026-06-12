import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin, RefreshCw, Search, AlertTriangle, Crown, UserCheck, User as UserIcon, Building2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";

type Pessoa = {
  id: string;
  nome: string;
  telefone: string | null;
  tipo: string;
  regiao: string | null;
  cidade: string | null;
  bairro: string | null;
  rua: string | null;
  numero: string | null;
  lat: number | null;
  lng: number | null;
  geocode_status: string | null;
  geocode_precision: string | null;
};

const TIPO_LABEL: Record<string, string> = {
  coordenador: "Coordenador",
  lider: "Líder",
  cabo: "Cabo Eleitoral",
  liderado: "Liderado",
};

const TIPO_COLOR: Record<string, string> = {
  coordenador: "#8b5cf6",
  lider: "#3b82f6",
  cabo: "#10b981",
  liderado: "#94a3b8",
};

const TIPO_ICON_RECORD: Record<string, any> = {
  coordenador: Crown,
  lider: UserCheck,
  cabo: UserIcon,
  liderado: UserIcon,
};

const ALL_CITIES = "__ALL__";

const normCity = (s: string | null | undefined) =>
  (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

function pinSvg(color: string, size = 36, precision: string | null = "rua"): string {
  const opacity = precision === "cidade" ? 0.5 : precision === "bairro" ? 0.75 : 1;
  const stroke = precision === "rua" ? "white" : color;
  const strokeDash = precision === "rua" ? "" : `stroke-dasharray="2,1.5"`;
  const inner = precision === "cidade"
    ? `<text x="12" y="12" text-anchor="middle" font-size="6" font-weight="bold" fill="${color}" font-family="system-ui">~</text>`
    : `<circle cx="12" cy="9" r="2.8" fill="white"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" opacity="${opacity}">
    <path fill="${color}" stroke="${stroke}" stroke-width="1.5" ${strokeDash} d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
    ${inner}
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const PRECISION_LABEL: Record<string, string> = {
  rua: "Endereço exato",
  bairro: "Aproximado (bairro)",
  cidade: "Aproximado (cidade)",
};

export function CityCoverageMap({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<any>(null);

  const [activeTipos, setActiveTipos] = useState<Set<string>>(new Set(["coordenador", "lider", "cabo"]));
  const [search, setSearch] = useState("");
  const [geocoding, setGeocoding] = useState(false);
  const [cityFilter, setCityFilter] = useState<string>(ALL_CITIES);
  const [editing, setEditing] = useState<Pessoa | null>(null);

  const { data: pessoas = [], isLoading } = useQuery({
    queryKey: ["coverage-pessoas", clientId],
    enabled: !!clientId,
    queryFn: async (): Promise<Pessoa[]> => {
      const { data, error } = await supabase
        .from("eleicao_pessoas" as any)
        .select("id, nome, telefone, tipo, regiao, cidade, bairro, rua, numero, lat, lng, geocode_status, geocode_precision")
        .eq("client_id", clientId)
        .limit(5000);
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const cidades = useMemo(() => {
    const map = new Map<string, { label: string; total: number; coord: number; lider: number; cabo: number; geocoded: number }>();
    for (const p of pessoas) {
      const raw = (p.cidade || "").trim();
      const label = raw || "Sem cidade";
      const key = normCity(label);
      let g = map.get(key);
      if (!g) { g = { label, total: 0, coord: 0, lider: 0, cabo: 0, geocoded: 0 }; map.set(key, g); }
      g.total++;
      if (p.tipo === "coordenador") g.coord++;
      else if (p.tipo === "lider") g.lider++;
      else if (p.tipo === "cabo") g.cabo++;
      if (p.lat != null && p.lng != null) g.geocoded++;
    }
    return Array.from(map.entries()).map(([key, v]) => ({ key, ...v })).sort((a, b) => b.total - a.total);
  }, [pessoas]);

  const pessoasNaCidade = useMemo(() => {
    if (cityFilter === ALL_CITIES) return pessoas;
    return pessoas.filter((p) => normCity(p.cidade || "Sem cidade") === cityFilter);
  }, [pessoas, cityFilter]);

  const stats = useMemo(() => {
    const total = pessoasNaCidade.length;
    const geocoded = pessoasNaCidade.filter((p) => p.lat != null && p.lng != null).length;
    const exact = pessoasNaCidade.filter((p) => p.geocode_precision === "rua").length;
    const approxBairro = pessoasNaCidade.filter((p) => p.geocode_precision === "bairro").length;
    const approxCidade = pessoasNaCidade.filter((p) => p.geocode_precision === "cidade").length;
    const pending = pessoasNaCidade.filter((p) => p.lat == null && (p.cidade || p.bairro || p.rua || p.numero)).length;
    const semCidade = pessoasNaCidade.filter((p) => !p.cidade || !p.cidade.trim()).length;
    const semBairro = pessoasNaCidade.filter((p) => !p.bairro || !p.bairro.trim()).length;
    return { total, geocoded, exact, approxBairro, approxCidade, pending, semCidade, semBairro };
  }, [pessoasNaCidade]);

  const pendingList = useMemo(() => {
    return pessoasNaCidade.filter((p) => p.lat == null || p.lng == null).map((p) => ({
      ...p,
      motivo:
        p.geocode_status === "no_address" ? "Sem endereço cadastrado" :
        p.geocode_status === "city_not_found" ? "Cidade não localizada" :
        !p.cidade ? "Sem cidade" :
        p.geocode_status ? `Falha: ${p.geocode_status}` : "Aguardando geocodificação",
    }));
  }, [pessoasNaCidade]);

  const [showPendentes, setShowPendentes] = useState(false);

  const filteredPins = useMemo(() => {
    const term = search.trim().toLowerCase();
    return pessoasNaCidade.filter((p) => {
      if (p.lat == null || p.lng == null) return false;
      if (!activeTipos.has(p.tipo)) return false;
      if (term) {
        const hay = `${p.nome} ${p.bairro || ""} ${p.cidade || ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [pessoasNaCidade, activeTipos, search]);

  // Inicializa mapa Leaflet uma vez
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;

    const map = L.map(mapDivRef.current, {
      center: [-20.4697, -54.6201],
      zoom: 7,
      scrollWheelZoom: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    const cluster = (L as any).markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 50,
    });
    map.addLayer(cluster);

    mapRef.current = map;
    clusterRef.current = cluster;

    return () => {
      map.remove();
      mapRef.current = null;
      clusterRef.current = null;
    };
  }, []);

  // Atualiza pinos
  useEffect(() => {
    const map = mapRef.current;
    const cluster = clusterRef.current;
    if (!map || !cluster) return;

    cluster.clearLayers();

    const bounds = L.latLngBounds([]);

    for (const p of filteredPins) {
      const color = TIPO_COLOR[p.tipo] || "#64748b";
      const precision = (p.geocode_precision as "rua" | "bairro" | "cidade" | null) || "rua";
      const baseSize = p.tipo === "coordenador" ? 44 : 32;
      const size = precision === "cidade" ? Math.round(baseSize * 0.8) : baseSize;

      const icon = L.icon({
        iconUrl: pinSvg(color, size, precision),
        iconSize: [size, size],
        iconAnchor: [size / 2, size],
        popupAnchor: [0, -size],
      });

      const marker = L.marker([Number(p.lat), Number(p.lng)], { icon, title: p.nome });

      const aproxNota = precision === "rua" ? "" : `
        <div style="margin-top:6px; padding:6px 8px; background:#fef3c7; border-radius:6px; font-size:11px; color:#92400e;">
          📍 ${PRECISION_LABEL[precision]} — endereço não totalmente confirmado.
        </div>`;
      const html = `
        <div style="font-family: system-ui; min-width: 220px; padding: 4px;">
          <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">${p.nome}</div>
          <div style="font-size: 12px; color: #64748b;">
            <div><strong>${TIPO_LABEL[p.tipo] || p.tipo}</strong></div>
            ${p.regiao ? `<div>Região: ${p.regiao}</div>` : ""}
            ${p.rua ? `<div>${p.rua}${p.numero ? `, ${p.numero}` : ""}</div>` : ""}
            ${p.bairro ? `<div>Bairro: ${p.bairro}</div>` : ""}
            ${p.cidade ? `<div>Cidade: ${p.cidade}</div>` : ""}
            ${p.telefone ? `<div style="margin-top:6px;"><a href="https://wa.me/${p.telefone.replace(/\D/g, "")}" target="_blank" style="color:#10b981; text-decoration:none;">📱 WhatsApp</a></div>` : ""}
            ${aproxNota}
            <button data-edit-id="${p.id}" style="margin-top:10px; width:100%; padding:6px 10px; background:#0f172a; color:white; border:none; border-radius:6px; font-size:12px; font-weight:500; cursor:pointer;">
              ✏️ Editar cadastro
            </button>
          </div>
        </div>`;

      marker.bindPopup(html);
      marker.on("popupopen", (e: any) => {
        const popupEl = e.popup.getElement() as HTMLElement | null;
        const btn = popupEl?.querySelector(`button[data-edit-id="${p.id}"]`);
        if (btn) {
          btn.addEventListener("click", () => {
            map.closePopup();
            setEditing(p);
          }, { once: true });
        }
      });

      cluster.addLayer(marker);
      bounds.extend([Number(p.lat), Number(p.lng)]);
    }

    if (filteredPins.length > 0 && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
    }
  }, [filteredPins]);

  const handleGeocode = async (force = false) => {
    if (geocoding) return;
    setGeocoding(true);
    let totalSuccess = 0, totalFailed = 0;
    try {
      let rounds = 0;
      let lastPending = Infinity;
      let stalledRounds = 0;
      let forcedRetry = false;
      while (rounds < 80) {
        const shouldForce = (force && rounds === 0) || (stalledRounds >= 2 && !forcedRetry);
        if (shouldForce && rounds > 0) forcedRetry = true;
        const { data, error } = await supabase.functions.invoke("geocode-eleicao-pessoas", {
          body: {
            clientId,
            limit: 15,
            force: shouldForce,
            defaultCity: "Campo Grande",
            defaultState: "MS",
            defaultCountry: "BR",
          },
        });
        if (error) throw error;
        const res = data as { success: number; failed: number; pending: number };
        totalSuccess += res.success;
        totalFailed += res.failed;
        toast.info(`Geocodificando… ${totalSuccess} ok · ${res.pending} restantes`);
        if (res.pending === 0) break;
        if (res.pending >= lastPending) {
          stalledRounds++;
          if (stalledRounds >= 4) {
            toast.warning(`${res.pending} sem cidade reconhecível — abra "Ver pendências" para editar`);
            break;
          }
          await new Promise((r) => setTimeout(r, 2000));
        } else {
          stalledRounds = 0;
        }
        lastPending = res.pending;
        rounds++;
      }
      toast.success(`Concluído: ${totalSuccess} localizados${totalFailed ? ` · ${totalFailed} falhas` : ""}`);
      qc.invalidateQueries({ queryKey: ["coverage-pessoas", clientId] });
    } catch (e: any) {
      toast.error(e?.message || "Falha no geocoding");
    } finally {
      setGeocoding(false);
    }
  };

  const toggleTipo = (t: string) => {
    setActiveTipos((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <MapPin className="w-5 h-5 text-primary" />
          Mapa de Cobertura da Equipe
        </h2>
        <p className="text-xs text-muted-foreground">
          Visualize onde estão seus <strong>coordenadores, líderes e cabos</strong> — em qualquer cidade.
          Use o filtro de cidade para focar a análise.
        </p>
      </div>

      {/* Seletor de cidade */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Building2 className="w-4 h-4 text-muted-foreground" />
            <Label className="text-xs font-semibold">Cidade:</Label>
            <Button
              size="sm"
              variant={cityFilter === ALL_CITIES ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={() => setCityFilter(ALL_CITIES)}
            >
              Todas <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">{pessoas.length}</Badge>
            </Button>
            {cidades.map((c) => (
              <Button
                key={c.key}
                size="sm"
                variant={cityFilter === c.key ? "default" : "outline"}
                className="h-7 text-xs"
                onClick={() => setCityFilter(c.key)}
                title={`${c.coord} coord · ${c.lider} líderes · ${c.cabo} cabos · ${c.geocoded}/${c.total} no mapa`}
              >
                {c.label}
                <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">{c.total}</Badge>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4 pb-3 px-4">
          <p className="text-xs text-muted-foreground">Equipe {cityFilter === ALL_CITIES ? "total" : "na cidade"}</p>
          <p className="text-2xl font-bold">{stats.total.toLocaleString("pt-BR")}</p>
          <p className="text-[10px] text-muted-foreground">{cityFilter === ALL_CITIES ? `${cidades.length} cidade(s)` : "Pessoas cadastradas"}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 px-4">
          <p className="text-xs text-muted-foreground">No mapa</p>
          <p className="text-2xl font-bold text-primary">{stats.geocoded.toLocaleString("pt-BR")}</p>
          <p className="text-[10px] text-muted-foreground">{stats.exact} exato · {stats.approxBairro} bairro · {stats.approxCidade} cidade</p>
        </CardContent></Card>
      </div>

      {/* Aviso geocoding */}
      {stats.pending > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-3 px-4 flex items-center gap-3 flex-wrap">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <div className="text-xs flex-1 min-w-[200px]">
              <p className="font-medium">{stats.pending} pessoa{stats.pending === 1 ? "" : "s"} com endereço sem coordenadas</p>
              <p className="text-muted-foreground">A geocodificação tenta rua → bairro → cidade via OpenStreetMap. Pode levar alguns segundos por endereço (limite gratuito).</p>
            </div>
            <Button size="sm" onClick={() => handleGeocode(false)} disabled={geocoding}>
              {geocoding ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1.5" />}
              {geocoding ? "Geocodificando…" : "Geocodificar agora"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleGeocode(true)} disabled={geocoding} title="Reprocessa todos">
              <RefreshCw className="w-4 h-4 mr-1.5" />
              Reprocessar tudo
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Painel de auditoria */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
            <p className="text-xs font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-muted-foreground" />
              Qualidade dos dados
            </p>
            {pendingList.length > 0 && (
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowPendentes((s) => !s)}>
                {showPendentes ? "Ocultar pendências" : `Ver ${pendingList.length} pendência${pendingList.length === 1 ? "" : "s"}`}
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-center">
            <div className="rounded-md border bg-card p-2">
              <p className="text-[10px] text-muted-foreground">Total</p>
              <p className="text-base font-bold">{stats.total}</p>
            </div>
            <div className="rounded-md border bg-card p-2">
              <p className="text-[10px] text-muted-foreground">Rua exata</p>
              <p className="text-base font-bold text-primary">{stats.exact}</p>
            </div>
            <div className="rounded-md border bg-card p-2">
              <p className="text-[10px] text-muted-foreground">Aprox. bairro</p>
              <p className="text-base font-bold">{stats.approxBairro}</p>
            </div>
            <div className="rounded-md border bg-card p-2">
              <p className="text-[10px] text-muted-foreground">Aprox. cidade</p>
              <p className="text-base font-bold">{stats.approxCidade}</p>
            </div>
            <div className={`rounded-md border p-2 ${stats.semCidade ? "border-destructive/40 bg-destructive/5" : "bg-card"}`}>
              <p className="text-[10px] text-muted-foreground">Sem cidade</p>
              <p className="text-base font-bold text-destructive">{stats.semCidade}</p>
            </div>
            <div className={`rounded-md border p-2 ${stats.semBairro ? "border-amber-500/40 bg-amber-500/5" : "bg-card"}`}>
              <p className="text-[10px] text-muted-foreground">Sem bairro</p>
              <p className="text-base font-bold">{stats.semBairro}</p>
            </div>
          </div>
          {showPendentes && pendingList.length > 0 && (
            <div className="mt-3 border-t pt-3 max-h-[280px] overflow-y-auto divide-y">
              {pendingList.slice(0, 200).map((p) => (
                <div key={p.id} className="py-2 text-xs flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{p.nome}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {[p.rua, p.numero].filter(Boolean).join(", ") || "—"} {p.bairro ? `· ${p.bairro}` : ""} {p.cidade ? `· ${p.cidade}` : ""}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">{p.motivo}</Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[10px] shrink-0"
                    onClick={() => setEditing(p)}
                  >
                    <Pencil className="w-3 h-3 mr-1" /> Editar
                  </Button>
                </div>
              ))}
              {pendingList.length > 200 && (
                <p className="text-[10px] text-muted-foreground py-2 text-center">+ {pendingList.length - 200} pendências…</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filtros e legenda */}
      <Card>
        <CardContent className="py-3 px-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {(["coordenador", "lider", "cabo"] as const).map((t) => {
              const Icon = TIPO_ICON_RECORD[t];
              const active = activeTipos.has(t);
              const count = pessoasNaCidade.filter((p) => p.tipo === t).length;
              const noMapa = filteredPins.filter((p) => p.tipo === t).length;
              return (
                <Button
                  key={t}
                  size="sm"
                  variant={active ? "default" : "outline"}
                  className="h-8 text-xs gap-1.5"
                  onClick={() => toggleTipo(t)}
                  style={active ? { background: TIPO_COLOR[t], borderColor: TIPO_COLOR[t] } : { borderColor: TIPO_COLOR[t], color: TIPO_COLOR[t] }}
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: active ? "white" : TIPO_COLOR[t] }} />
                  <Icon className="w-3.5 h-3.5" />
                  {TIPO_LABEL[t]}
                  <Badge
                    variant="secondary"
                    className="ml-1 h-4 px-1 text-[10px]"
                    title={`${noMapa} no mapa de ${count} cadastrados`}
                  >{count}</Badge>
                </Button>
              );
            })}
          </div>
          <div className="relative w-full sm:w-64 ml-auto">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar nome, bairro…"
              className="h-8 pl-7 text-xs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Mapa */}
      <Card>
        <CardContent className="p-0 relative">
          {isLoading && (
            <div className="absolute inset-0 z-[500] flex items-center justify-center bg-background/60">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          )}
          <div ref={mapDivRef} className="w-full h-[600px] rounded-md" />
        </CardContent>
      </Card>

      {/* Dialog de edição rápida de endereço */}
      <EditEnderecoDialog
        pessoa={editing}
        clientId={clientId}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          qc.invalidateQueries({ queryKey: ["coverage-pessoas", clientId] });
        }}
      />
    </div>
  );
}

// ============================================================================
// Dialog leve para editar só o endereço e disparar reprocessamento do pino
// ============================================================================
function EditEnderecoDialog({
  pessoa, clientId, onClose, onSaved,
}: {
  pessoa: Pessoa | null;
  clientId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rua, setRua] = useState("");
  const [numero, setNumero] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (pessoa) {
      setRua(pessoa.rua || "");
      setNumero(pessoa.numero || "");
      setBairro(pessoa.bairro || "");
      setCidade(pessoa.cidade || "");
    }
  }, [pessoa]);

  if (!pessoa) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("eleicao_pessoas" as any)
        .update({
          rua: rua.trim() || null,
          numero: numero.trim() || null,
          bairro: bairro.trim() || null,
          cidade: cidade.trim() || null,
          lat: null,
          lng: null,
          geocode_status: null,
          geocode_precision: null,
          geocode_endereco_hash: null,
        })
        .eq("id", pessoa.id);
      if (error) throw error;

      toast.info("Endereço atualizado. Localizando no mapa…");

      const { data, error: gErr } = await supabase.functions.invoke("geocode-eleicao-pessoas", {
        body: {
          clientId,
          ids: [pessoa.id],
          force: true,
          defaultCity: cidade.trim() || "Campo Grande",
          defaultState: "MS",
          defaultCountry: "BR",
        },
      });
      if (gErr) throw gErr;
      const res = data as { success: number };
      if (res?.success) {
        toast.success("Pessoa posicionada no mapa!");
      } else {
        toast.warning("Salvo, mas não foi possível posicionar — verifique a cidade.");
      }
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!pessoa} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar endereço · {pessoa.nome}</DialogTitle>
          <DialogDescription>
            Corrija a cidade, bairro ou rua. Após salvar, o pino é reposicionado automaticamente.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <Label className="text-xs">Rua</Label>
              <Input value={rua} onChange={(e) => setRua(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Número</Label>
              <Input value={numero} onChange={(e) => setNumero(e.target.value)} className="h-9" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Bairro</Label>
            <Input value={bairro} onChange={(e) => setBairro(e.target.value)} className="h-9" />
          </div>
          <div>
            <Label className="text-xs">Cidade *</Label>
            <Input
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
              className="h-9"
              placeholder="Ex.: Dourados, Três Lagoas, Campo Grande…"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              A cidade é o mínimo necessário para a pessoa aparecer no mapa.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !cidade.trim()}>
            {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
            Salvar e localizar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
