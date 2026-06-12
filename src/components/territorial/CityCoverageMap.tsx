import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useGoogleMaps } from "@/hooks/useGoogleMaps";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin, RefreshCw, Search, AlertTriangle, Crown, UserCheck, User as UserIcon, Building2 } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

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

function pinSvg(color: string, size = 36): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}">
    <path fill="${color}" stroke="white" stroke-width="1.5" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
    <circle cx="12" cy="9" r="2.8" fill="white"/>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function CityCoverageMap({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const { loaded, error: mapsError } = useGoogleMaps();
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const markersRef = useRef<any[]>([]);

  const [activeTipos, setActiveTipos] = useState<Set<string>>(new Set(["coordenador", "lider", "cabo"]));
  const [showLiderados, setShowLiderados] = useState(false);
  const [heatmap, setHeatmap] = useState(false);
  const [search, setSearch] = useState("");
  const [geocoding, setGeocoding] = useState(false);
  const [cityFilter, setCityFilter] = useState<string>(ALL_CITIES);

  const { data: pessoas = [], isLoading } = useQuery({
    queryKey: ["coverage-pessoas", clientId],
    enabled: !!clientId,
    queryFn: async (): Promise<Pessoa[]> => {
      const { data, error } = await supabase
        .from("eleicao_pessoas" as any)
        .select("id, nome, telefone, tipo, regiao, cidade, bairro, rua, numero, lat, lng, geocode_status")
        .eq("client_id", clientId)
        .limit(5000);
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  // Lista de cidades distintas com contagem
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

  // Filtra pessoas pela cidade selecionada
  const pessoasNaCidade = useMemo(() => {
    if (cityFilter === ALL_CITIES) return pessoas;
    return pessoas.filter((p) => normCity(p.cidade || "Sem cidade") === cityFilter);
  }, [pessoas, cityFilter]);

  const stats = useMemo(() => {
    const total = pessoasNaCidade.length;
    const geocoded = pessoasNaCidade.filter((p) => p.lat != null && p.lng != null).length;
    const pending = pessoasNaCidade.filter((p) => p.lat == null && (p.cidade || p.bairro || p.rua || p.numero)).length;
    const semCidade = pessoasNaCidade.filter((p) => !p.cidade || !p.cidade.trim()).length;
    const semBairro = pessoasNaCidade.filter((p) => !p.bairro || !p.bairro.trim()).length;
    const cityMismatch = pessoasNaCidade.filter((p) => p.geocode_status === "city_mismatch").length;
    const outOfRegion = pessoasNaCidade.filter((p) => p.geocode_status === "out_of_region").length;
    const bairroNaoConfirmado = pessoasNaCidade.filter((p) => p.geocode_status === "bairro_nao_confirmado").length;
    return { total, geocoded, pending, semCidade, semBairro, cityMismatch, outOfRegion, bairroNaoConfirmado };
  }, [pessoasNaCidade]);

  const pendingList = useMemo(() => {
    return pessoasNaCidade.filter((p) => p.lat == null || p.lng == null).map((p) => ({
      ...p,
      motivo:
        p.geocode_status === "city_mismatch" ? "Cidade divergente do retorno do Google" :
        p.geocode_status === "out_of_region" ? "Fora da região esperada" :
        p.geocode_status === "bairro_nao_confirmado" ? "Bairro não confirmado pelo Google" :
        p.geocode_status === "no_address" ? "Sem endereço cadastrado" :
        !p.cidade ? "Sem cidade" :
        !p.bairro ? "Sem bairro" :
        p.geocode_status ? `Falha: ${p.geocode_status}` : "Aguardando geocodificação",
    }));
  }, [pessoasNaCidade]);

  const [showPendentes, setShowPendentes] = useState(false);

  // Análise de gaps por bairro (dentro da cidade filtrada)
  const gapAnalysis = useMemo(() => {
    const byBairro = new Map<string, { bairro: string; cidade: string; total: number; coordenadores: number; lideres: number; cabos: number; }>();
    for (const p of pessoasNaCidade) {
      const b = (p.bairro || "Sem bairro").trim();
      const c = (p.cidade || "Sem cidade").trim();
      const key = `${c}||${b}`;
      let g = byBairro.get(key);
      if (!g) { g = { bairro: b, cidade: c, total: 0, coordenadores: 0, lideres: 0, cabos: 0 }; byBairro.set(key, g); }
      g.total++;
      if (p.tipo === "coordenador") g.coordenadores++;
      else if (p.tipo === "lider") g.lideres++;
      else if (p.tipo === "cabo") g.cabos++;
    }
    const arr = Array.from(byBairro.values());
    const semCoord = arr.filter((g) => g.coordenadores === 0 && g.total > 0);
    return {
      bairros: arr.sort((a, b) => b.total - a.total),
      semCoord: semCoord.sort((a, b) => b.total - a.total),
      coverage: arr.length === 0 ? 0 : Math.round(((arr.length - semCoord.length) / arr.length) * 100),
    };
  }, [pessoasNaCidade]);

  const filteredPins = useMemo(() => {
    const term = search.trim().toLowerCase();
    return pessoasNaCidade.filter((p) => {
      if (p.lat == null || p.lng == null) return false;
      const tipoOk = activeTipos.has(p.tipo) || (showLiderados && p.tipo === "liderado");
      if (!tipoOk) return false;
      if (term) {
        const hay = `${p.nome} ${p.bairro || ""} ${p.cidade || ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [pessoasNaCidade, activeTipos, showLiderados, search]);

  // Inicializa mapa
  useEffect(() => {
    if (!loaded || !mapDivRef.current || mapRef.current) return;
    const google = (window as any).google;

    const withCoords = pessoas.filter((p) => p.lat && p.lng);
    let center = { lat: -20.4697, lng: -54.6201 };
    if (withCoords.length > 0) {
      const avgLat = withCoords.reduce((s, p) => s + (p.lat || 0), 0) / withCoords.length;
      const avgLng = withCoords.reduce((s, p) => s + (p.lng || 0), 0) / withCoords.length;
      center = { lat: avgLat, lng: avgLng };
    }

    mapRef.current = new google.maps.Map(mapDivRef.current, {
      center,
      zoom: 7,
      mapTypeControl: true,
      streetViewControl: false,
      fullscreenControl: true,
    });
  }, [loaded, pessoas]);

  // Atualiza pinos
  useEffect(() => {
    if (!loaded || !mapRef.current) return;
    const google = (window as any).google;

    markersRef.current.forEach((m) => m.setMap?.(null));
    markersRef.current = [];
    clustererRef.current?.clearMarkers();

    const bounds = new google.maps.LatLngBounds();
    const infoWindow = new google.maps.InfoWindow();

    const markers = filteredPins.map((p) => {
      const color = TIPO_COLOR[p.tipo] || "#64748b";
      const marker = new google.maps.Marker({
        position: { lat: Number(p.lat), lng: Number(p.lng) },
        icon: {
          url: pinSvg(color, p.tipo === "coordenador" ? 44 : 32),
          scaledSize: new google.maps.Size(p.tipo === "coordenador" ? 44 : 32, p.tipo === "coordenador" ? 44 : 32),
          anchor: new google.maps.Point(p.tipo === "coordenador" ? 22 : 16, p.tipo === "coordenador" ? 44 : 32),
        },
        title: p.nome,
      });
      marker.addListener("click", () => {
        infoWindow.setContent(`
          <div style="font-family: system-ui; min-width: 200px; padding: 4px;">
            <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">${p.nome}</div>
            <div style="font-size: 12px; color: #64748b;">
              <div><strong>${TIPO_LABEL[p.tipo] || p.tipo}</strong></div>
              ${p.regiao ? `<div>Região: ${p.regiao}</div>` : ""}
              ${p.bairro ? `<div>Bairro: ${p.bairro}</div>` : ""}
              ${p.cidade ? `<div>Cidade: ${p.cidade}</div>` : ""}
              ${p.telefone ? `<div style="margin-top:6px;"><a href="https://wa.me/${p.telefone.replace(/\D/g, "")}" target="_blank" style="color:#10b981; text-decoration:none;">📱 WhatsApp</a></div>` : ""}
            </div>
          </div>
        `);
        infoWindow.open(mapRef.current, marker);
      });
      bounds.extend({ lat: Number(p.lat), lng: Number(p.lng) });
      return marker;
    });

    markersRef.current = markers;

    if (heatmap && google.maps.visualization) {
      const heat = new google.maps.visualization.HeatmapLayer({
        data: markers.map((m) => m.getPosition()),
        radius: 30,
      });
      heat.setMap(mapRef.current);
      markersRef.current.push({ setMap: (m: any) => heat.setMap(m) } as any);
    } else {
      markers.forEach((m) => m.setMap(mapRef.current));
    }

    if (markers.length > 0) {
      mapRef.current.fitBounds(bounds, 60);
      // evita zoom excessivo quando só existe 1 pino
      const listener = google.maps.event.addListenerOnce(mapRef.current, "bounds_changed", () => {
        if (mapRef.current.getZoom() > 15) mapRef.current.setZoom(15);
      });
      void listener;
    }
  }, [filteredPins, loaded, heatmap]);

  const handleGeocode = async (force = false) => {
    if (geocoding) return;
    setGeocoding(true);
    let totalSuccess = 0, totalFailed = 0, totalMismatch = 0;
    try {
      let rounds = 0;
      let lastPending = Infinity;
      let stalledRounds = 0;
      while (rounds < 60) {
        const { data, error } = await supabase.functions.invoke("geocode-eleicao-pessoas", {
          body: {
            clientId,
            limit: 25,
            force: force && rounds === 0,
            defaultCity: "Campo Grande",
            defaultState: "MS",
            defaultCountry: "BR",
          },
        });
        if (error) throw error;
        const res = data as { success: number; failed: number; pending: number; cityMismatch?: number };
        totalSuccess += res.success;
        totalFailed += res.failed;
        totalMismatch += res.cityMismatch || 0;
        toast.info(`Geocodificando… ${totalSuccess} ok · ${res.pending} restantes`);
        if (res.pending === 0) break;
        if (res.pending >= lastPending) {
          stalledRounds++;
          if (stalledRounds >= 2) {
            toast.warning(`Geocoding pausado: ${res.pending} pendentes. Verifique cidade/bairro nos cadastros e tente novamente.`);
            break;
          }
          await new Promise((r) => setTimeout(r, 3000));
        } else {
          stalledRounds = 0;
        }
        lastPending = res.pending;
        rounds++;
      }
      toast.success(`Concluído: ${totalSuccess} localizados${totalMismatch ? ` · ${totalMismatch} cidade divergente` : ""}${totalFailed ? ` · ${totalFailed} falhas` : ""}`);
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
          <p className="text-[10px] text-muted-foreground">Endereços geolocalizados</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 px-4">
          <p className="text-xs text-muted-foreground">Cobertura por bairro</p>
          <p className="text-2xl font-bold">{gapAnalysis.coverage}%</p>
          <p className="text-[10px] text-muted-foreground">{gapAnalysis.bairros.length - gapAnalysis.semCoord.length}/{gapAnalysis.bairros.length} bairros c/ coordenador</p>
        </CardContent></Card>
        <Card className={gapAnalysis.semCoord.length > 0 ? "border-amber-500/40" : ""}><CardContent className="pt-4 pb-3 px-4">
          <p className="text-xs text-muted-foreground">Lacunas</p>
          <p className="text-2xl font-bold text-amber-600">{gapAnalysis.semCoord.length}</p>
          <p className="text-[10px] text-muted-foreground">Bairros sem coordenador</p>
        </CardContent></Card>
      </div>

      {/* Aviso geocoding */}
      {stats.pending > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-3 px-4 flex items-center gap-3 flex-wrap">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <div className="text-xs flex-1 min-w-[200px]">
              <p className="font-medium">{stats.pending} pessoa{stats.pending === 1 ? "" : "s"} com endereço sem coordenadas</p>
              <p className="text-muted-foreground">Geocodifica respeitando a cidade de cada cadastro (Dourados → Dourados, Campo Grande → Campo Grande, etc.).</p>
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
              <p className="text-[10px] text-muted-foreground">No mapa</p>
              <p className="text-base font-bold text-primary">{stats.geocoded}</p>
            </div>
            <div className={`rounded-md border p-2 ${stats.semCidade ? "border-amber-500/40 bg-amber-500/5" : "bg-card"}`}>
              <p className="text-[10px] text-muted-foreground">Sem cidade</p>
              <p className="text-base font-bold">{stats.semCidade}</p>
            </div>
            <div className={`rounded-md border p-2 ${stats.semBairro ? "border-amber-500/40 bg-amber-500/5" : "bg-card"}`}>
              <p className="text-[10px] text-muted-foreground">Sem bairro</p>
              <p className="text-base font-bold">{stats.semBairro}</p>
            </div>
            <div className={`rounded-md border p-2 ${stats.cityMismatch ? "border-destructive/40 bg-destructive/5" : "bg-card"}`}>
              <p className="text-[10px] text-muted-foreground">Cidade divergente</p>
              <p className="text-base font-bold text-destructive">{stats.cityMismatch}</p>
            </div>
            <div className={`rounded-md border p-2 ${stats.bairroNaoConfirmado ? "border-amber-500/40 bg-amber-500/5" : "bg-card"}`}>
              <p className="text-[10px] text-muted-foreground">Bairro não confirmado</p>
              <p className="text-base font-bold">{stats.bairroNaoConfirmado}</p>
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
              const count = filteredPins.filter((p) => p.tipo === t).length;
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
                  <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{count}</Badge>
                </Button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <Switch id="liderados" checked={showLiderados} onCheckedChange={setShowLiderados} />
            <Label htmlFor="liderados" className="text-xs cursor-pointer">Mostrar liderados</Label>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Switch id="heatmap" checked={heatmap} onCheckedChange={setHeatmap} />
            <Label htmlFor="heatmap" className="text-xs cursor-pointer">Heatmap</Label>
          </div>
          <div className="relative w-full sm:w-64">
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Mapa */}
        <Card className="lg:col-span-2">
          <CardContent className="p-0 relative">
            {mapsError ? (
              <div className="h-[600px] flex items-center justify-center text-sm text-destructive p-4 text-center">
                Erro carregando Google Maps: {mapsError}
              </div>
            ) : !loaded ? (
              <div className="h-[600px] flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : isLoading ? (
              <div className="h-[600px] flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : null}
            <div ref={mapDivRef} className="w-full h-[600px] rounded-md" style={{ display: loaded && !mapsError ? "block" : "none" }} />
          </CardContent>
        </Card>

        {/* Painel de lacunas */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Bairros sem coordenador
            </CardTitle>
            <CardDescription className="text-xs">
              Priorize cadastrar coordenadores nestes bairros{cityFilter !== ALL_CITIES ? " (cidade filtrada)" : ""}.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[540px] overflow-y-auto divide-y">
              {gapAnalysis.semCoord.length === 0 ? (
                <p className="text-xs text-muted-foreground p-4 text-center">
                  🎉 Todos os bairros com cadastros já têm coordenador!
                </p>
              ) : (
                gapAnalysis.semCoord.slice(0, 50).map((g) => (
                  <div key={`${g.cidade}-${g.bairro}`} className="px-4 py-2.5 hover:bg-muted/40">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{g.bairro}</p>
                        <p className="text-[10px] text-muted-foreground">{g.cidade}</p>
                      </div>
                      <Badge variant={g.lideres > 0 ? "secondary" : "destructive"} className="text-[10px] shrink-0">
                        {g.total} pessoa{g.total === 1 ? "" : "s"}
                      </Badge>
                    </div>
                    {g.lideres > 0 && (
                      <p className="text-[10px] text-blue-600 mt-1">
                        ✓ {g.lideres} líder{g.lideres === 1 ? "" : "es"} · falta coordenador
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
