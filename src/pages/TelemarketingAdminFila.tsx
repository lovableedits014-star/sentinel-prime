import { useMemo, useState } from "react";
import { Loader2, Phone, Clock, ExternalLink, Search, MapPin } from "lucide-react";
import TelemarketingSubNav from "@/components/telemarketing/TelemarketingSubNav";
import { useContratadosData } from "@/components/contratados/useContratadosData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function TelemarketingAdminFila() {
  const { clientId, contratados, indicados, loading } = useContratadosData();
  const [search, setSearch] = useState("");
  const [tipo, setTipo] = useState<"todos" | "lider" | "liderado" | "indicado">("todos");

  const fila = useMemo(() => {
    const items = [
      ...contratados.map((c: any) => ({
        id: c.id,
        nome: c.nome,
        telefone: c.telefone,
        cidade: c.cidade,
        bairro: c.bairro,
        status: c.ligacao_status as string | null,
        tipo: c.is_lider ? "lider" : "liderado",
      })),
      ...indicados.map((i: any) => ({
        id: i.id,
        nome: i.nome,
        telefone: i.telefone,
        cidade: i.cidade,
        bairro: i.bairro,
        status: i.ligacao_status as string | null,
        tipo: "indicado",
      })),
    ].filter((r) => !r.status || r.status === "pendente");
    return items;
  }, [contratados, indicados]);

  const filtered = fila.filter((r) => {
    if (tipo !== "todos" && r.tipo !== tipo) return false;
    if (search && !r.nome.toLowerCase().includes(search.toLowerCase()) && !r.telefone?.includes(search)) return false;
    return true;
  });

  if (loading) return (
    <div className="p-4 md:p-6">
      <TelemarketingSubNav />
      <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
    </div>
  );

  const teleUrl = clientId ? `${window.location.origin}/telemarketing/${clientId}` : "";

  return (
    <div className="p-4 md:p-6">
      <TelemarketingSubNav />
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Fila ao vivo</h1>
          <p className="text-sm text-muted-foreground">Contatos pendentes aguardando ligação. {fila.length} no total.</p>
        </div>
        {teleUrl && (
          <Button asChild size="sm" variant="outline">
            <a href={teleUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4 mr-1" /> Abrir como operador
            </a>
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar nome ou telefone..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 h-9 text-sm" />
        </div>
        {(["todos", "lider", "liderado", "indicado"] as const).map((t) => (
          <Button key={t} size="sm" variant={tipo === t ? "default" : "outline"} className="text-xs capitalize" onClick={() => setTipo(t)}>
            {t === "todos" ? "Todos" : t}
            <span className="ml-1 opacity-60">({t === "todos" ? fila.length : fila.filter((r) => r.tipo === t).length})</span>
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">
          <Phone className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nenhum contato pendente {search ? "com este filtro" : ""}.</p>
        </CardContent></Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {filtered.slice(0, 200).map((r) => (
            <Card key={`${r.tipo}-${r.id}`}>
              <CardContent className="p-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-sm truncate">{r.nome}</p>
                  <Badge variant="outline" className="text-[10px] capitalize">{r.tipo}</Badge>
                </div>
                <a href={`tel:${r.telefone}`} className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                  <Phone className="w-3 h-3" /> {r.telefone}
                </a>
                {(r.cidade || r.bairro) && (
                  <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <MapPin className="w-3 h-3" />
                    {[r.bairro, r.cidade].filter(Boolean).join(", ")}
                  </p>
                )}
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Clock className="w-2.5 h-2.5" /> Pendente
                </div>
              </CardContent>
            </Card>
          ))}
          {filtered.length > 200 && (
            <p className="col-span-full text-center text-xs text-muted-foreground py-3">
              Mostrando os primeiros 200 de {filtered.length}. Use o filtro para refinar.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
