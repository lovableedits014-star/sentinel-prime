import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Users, Compass, Building2, Database, AlertCircle } from "lucide-react";

type IBGEData = {
  codigo: number;
  nome: string;
  uf: string;
  uf_nome: string;
  regiao: string;
  microrregiao: string | null;
  mesorregiao: string | null;
  populacao: number | null;
  ano_populacao: number | null;
  area_km2: number | null;
  densidade: number | null;
};

type Props =
  | { codigo: number; nome?: never; uf?: never; compact?: boolean }
  | { codigo?: never; nome: string; uf: string; compact?: boolean };

const fmt = (n: number | null | undefined, suf = "") =>
  n == null ? "—" : `${n.toLocaleString("pt-BR")}${suf}`;

function classifyPorte(pop: number | null): { label: string; tone: string } {
  if (pop == null) return { label: "—", tone: "secondary" };
  if (pop >= 500000) return { label: "Metrópole / Grande porte", tone: "default" };
  if (pop >= 100000) return { label: "Médio porte", tone: "default" };
  if (pop >= 20000) return { label: "Pequeno porte II", tone: "secondary" };
  return { label: "Pequeno porte I", tone: "secondary" };
}

export default function MunicipioContextoIBGE(props: Props) {
  const { compact } = props;
  const queryKey = props.codigo
    ? ["ibge-municipio", "codigo", props.codigo]
    : ["ibge-municipio", "nome", props.nome, props.uf];

  const { data, isLoading, error } = useQuery({
    queryKey,
    staleTime: Infinity,
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (props.codigo) params.codigo = String(props.codigo);
      else {
        params.nome = props.nome!;
        params.uf = props.uf!;
      }
      const qs = new URLSearchParams(params).toString();
      const { data, error } = await supabase.functions.invoke(`ibge-municipio-fetch?${qs}`, {
        method: "GET",
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return (data as { data: IBGEData }).data;
    },
    retry: 1,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3 w-64" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="pt-6 text-sm text-muted-foreground flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-destructive" />
          Não foi possível carregar dados do IBGE para este município.
        </CardContent>
      </Card>
    );
  }

  const porte = classifyPorte(data.populacao);

  if (compact) {
    return (
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <Badge variant="secondary" className="gap-1">
          <Users className="w-3 h-3" /> {fmt(data.populacao)} hab.
          {data.ano_populacao && <span className="opacity-60"> · {data.ano_populacao}</span>}
        </Badge>
        <Badge variant="outline" className="gap-1">
          <Compass className="w-3 h-3" /> {data.regiao}
        </Badge>
        {data.microrregiao && (
          <Badge variant="outline" className="gap-1">
            <MapPin className="w-3 h-3" /> {data.microrregiao}
          </Badge>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" />
              {data.nome} <span className="text-muted-foreground font-normal">/ {data.uf}</span>
            </CardTitle>
            <CardDescription className="text-xs flex items-center gap-1">
              <Database className="w-3 h-3" /> Dados oficiais IBGE · código {data.codigo}
            </CardDescription>
          </div>
          <Badge variant="default" className="text-xs">{porte.label}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat icon={<Users className="w-3.5 h-3.5" />} label="População" value={fmt(data.populacao)} hint={data.ano_populacao ? `Estimativa ${data.ano_populacao}` : undefined} />
          <Stat icon={<MapPin className="w-3.5 h-3.5" />} label="Área" value={data.area_km2 ? `${fmt(data.area_km2)} km²` : "—"} />
          <Stat icon={<Compass className="w-3.5 h-3.5" />} label="Densidade" value={data.densidade ? `${fmt(data.densidade)} hab/km²` : "—"} />
          <Stat icon={<Building2 className="w-3.5 h-3.5" />} label="Região" value={data.regiao || "—"} hint={data.mesorregiao || undefined} />
        </div>
        {data.microrregiao && (
          <p className="text-xs text-muted-foreground mt-3">
            Microrregião: <span className="text-foreground font-medium">{data.microrregiao}</span>
            {data.mesorregiao && <> · Mesorregião: <span className="text-foreground font-medium">{data.mesorregiao}</span></>}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded border bg-card/50 p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
        {icon} {label}
      </div>
      <div className="text-sm font-semibold mt-0.5">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}