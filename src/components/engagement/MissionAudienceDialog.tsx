import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Loader2, Plus, Search, UserMinus, UserPlus, X } from "lucide-react";
import { fmtPhoneBR } from "@/lib/phone-utils";
import {
  AUDIENCE_GROUP_HINT,
  AUDIENCE_GROUP_LABEL,
  type AudienceGroup,
  type AudienceRule,
  type MissionAudience,
  type PessoaOption,
  emptyRule,
  fetchAudienceMembers,
  fetchIndicadoresDisponiveis,
  fetchRegioesDisponiveis,
  previewAudience,
  removeAudienceMember,
  saveAudience,
  searchPessoas,
  setAudienceMember,
} from "@/lib/mission-audiences";

const GROUPS: AudienceGroup[] = ["coordenador", "lider", "cabo", "voluntario", "contratado", "funcionario"];
const ESCOPOS: { value: string; label: string }[] = [
  { value: "campo_grande", label: "Campo Grande" },
  { value: "interior", label: "Interior" },
];

type Props = {
  clientId: string;
  audience: MissionAudience | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: (id: string) => void;
};

export default function MissionAudienceDialog({ clientId, audience, open, onOpenChange, onSaved }: Props) {
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [rule, setRule] = useState<AudienceRule>(emptyRule());
  const [busca, setBusca] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNome(audience?.nome || "");
    setDescricao(audience?.descricao || "");
    setIsDefault(audience?.is_default || false);
    setRule(audience?.regra || emptyRule());
    setBusca("");
  }, [open, audience]);

  const { data: regioes = [] } = useQuery({
    queryKey: ["audience-regioes", clientId],
    queryFn: () => fetchRegioesDisponiveis(clientId),
    enabled: open && !!clientId,
    staleTime: 60_000,
  });

  const { data: indicadores = [] } = useQuery({
    queryKey: ["audience-indicadores", clientId],
    queryFn: () => fetchIndicadoresDisponiveis(clientId),
    enabled: open && !!clientId,
    staleTime: 60_000,
  });

  const { data: members = [], refetch: refetchMembers } = useQuery({
    queryKey: ["audience-members", audience?.id],
    queryFn: () => fetchAudienceMembers(audience!.id),
    enabled: open && !!audience?.id,
  });

  const { data: preview, isFetching: previewing } = useQuery({
    queryKey: ["audience-preview", clientId, rule, audience?.id, members.length],
    queryFn: () => previewAudience(clientId, rule, audience?.id ?? null),
    enabled: open && !!clientId,
    staleTime: 5_000,
  });

  const { data: resultados = [], isFetching: buscando } = useQuery<PessoaOption[]>({
    queryKey: ["audience-search", clientId, busca],
    queryFn: () => searchPessoas(clientId, busca),
    enabled: open && !!clientId && busca.trim().length >= 2,
  });

  const incluidos = useMemo(() => members.filter((m) => m.modo === "incluido"), [members]);
  const dispensados = useMemo(() => members.filter((m) => m.modo === "dispensado"), [members]);
  const nomeById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of resultados) map.set(p.id, p.nome);
    for (const i of indicadores) map.set(i.id, i.nome);
    return map;
  }, [resultados, indicadores]);

  const toggleArray = (key: "grupos" | "regioes" | "indicadores" | "escopos", value: string) => {
    setRule((prev) => {
      const cur = (prev[key] as string[]) || [];
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
      return { ...prev, [key]: next } as AudienceRule;
    });
  };

  const salvar = async () => {
    if (!nome.trim()) {
      toast.error("Dê um nome para a lista");
      return;
    }
    if (rule.grupos.length === 0 && incluidos.length === 0) {
      toast.error("Escolha ao menos um grupo ou adicione pessoas manualmente");
      return;
    }
    setSaving(true);
    try {
      const id = await saveAudience({
        id: audience?.id ?? null,
        clientId,
        nome: nome.trim(),
        descricao: descricao.trim() || null,
        regra: rule,
        isDefault: isDefault,
      });
      await qc.invalidateQueries({ queryKey: ["mission-audiences", clientId] });
      toast.success("Lista salva");
      onSaved?.(id);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao salvar a lista");
    } finally {
      setSaving(false);
    }
  };

  const addManual = async (p: PessoaOption, modo: "incluido" | "dispensado") => {
    if (!audience?.id) {
      toast.error("Salve a lista primeiro para poder ajustar pessoa por pessoa");
      return;
    }
    try {
      await setAudienceMember({
        clientId,
        audienceId: audience.id,
        origem: "eleicao",
        refId: p.id,
        modo,
      });
      await refetchMembers();
      toast.success(modo === "incluido" ? `${p.nome} adicionado` : `${p.nome} dispensado`);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao ajustar a lista");
    }
  };

  const removeManual = async (id: string) => {
    try {
      await removeAudienceMember(id);
      await refetchMembers();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao remover ajuste");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{audience ? "Editar lista de obrigados" : "Nova lista de obrigados"}</DialogTitle>
          <DialogDescription>
            Escolha grupos inteiros (o sistema puxa sozinho quem entrar depois) e ajuste pessoa por pessoa quando
            precisar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="aud-nome">Nome da lista</Label>
              <Input
                id="aud-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Contratados + voluntários"
                maxLength={80}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="aud-desc">Descrição (opcional)</Label>
              <Textarea
                id="aud-desc"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                rows={1}
                placeholder="Para que serve esta lista"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Grupos incluídos automaticamente</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {GROUPS.map((g) => (
                <label
                  key={g}
                  className="flex cursor-pointer items-start gap-2 rounded-md border p-2.5 text-sm hover:bg-muted/40"
                >
                  <Checkbox
                    checked={rule.grupos.includes(g)}
                    onCheckedChange={() => toggleArray("grupos", g)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium">{AUDIENCE_GROUP_LABEL[g]}</span>
                    <span className="block text-xs text-muted-foreground">{AUDIENCE_GROUP_HINT[g]}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label className="text-xs">Escopo</Label>
              {ESCOPOS.map((e) => (
                <label key={e.value} className="flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={rule.escopos.includes(e.value)}
                    onCheckedChange={() => toggleArray("escopos", e.value)}
                  />
                  {e.label}
                </label>
              ))}
              <p className="text-[10px] text-muted-foreground">Nada marcado = todos.</p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Regiões / cidades</Label>
              <ScrollArea className="h-32 rounded-md border p-2">
                {regioes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sem regiões cadastradas.</p>
                ) : (
                  regioes.map((r) => (
                    <label key={r} className="flex items-center gap-2 py-0.5 text-xs">
                      <Checkbox
                        checked={rule.regioes.includes(r)}
                        onCheckedChange={() => toggleArray("regioes", r)}
                      />
                      {r}
                    </label>
                  ))
                )}
              </ScrollArea>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Indicadores</Label>
              <ScrollArea className="h-32 rounded-md border p-2">
                {indicadores.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sem indicadores.</p>
                ) : (
                  indicadores.map((i) => (
                    <label key={i.id} className="flex items-center gap-2 py-0.5 text-xs">
                      <Checkbox
                        checked={rule.indicadores.includes(i.id)}
                        onCheckedChange={() => toggleArray("indicadores", i.id)}
                      />
                      {i.nome}
                    </label>
                  ))
                )}
              </ScrollArea>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label className="text-sm">Ajustes manuais</Label>
            {!audience?.id && (
              <p className="text-xs text-muted-foreground">
                Salve a lista para liberar a inclusão e a dispensa individual.
              </p>
            )}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar pessoa por nome ou telefone"
                className="pl-8"
              />
            </div>
            {buscando && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            {resultados.length > 0 && (
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                {resultados.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 text-xs">
                    <span>
                      <span className="font-medium">{p.nome}</span>{" "}
                      <span className="text-muted-foreground">
                        {p.tipo || "—"} · {fmtPhoneBR(p.telefone) || "sem telefone"}
                      </span>
                    </span>
                    <span className="flex shrink-0 gap-1">
                      <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[10px]"
                        onClick={() => addManual(p, "incluido")}>
                        <UserPlus className="h-3 w-3" /> Incluir
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-[10px]"
                        onClick={() => addManual(p, "dispensado")}>
                        <UserMinus className="h-3 w-3" /> Dispensar
                      </Button>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {(incluidos.length > 0 || dispensados.length > 0) && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-xs font-medium">Incluídos à mão ({incluidos.length})</p>
                  {incluidos.map((m) => (
                    <Badge key={m.id} variant="secondary" className="mr-1 gap-1 text-[10px]">
                      {nomeById.get(m.ref_id) || m.ref_id.slice(0, 8)}
                      <button onClick={() => removeManual(m.id)}><X className="h-3 w-3" /></button>
                    </Badge>
                  ))}
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium">Dispensados ({dispensados.length})</p>
                  {dispensados.map((m) => (
                    <Badge key={m.id} variant="outline" className="mr-1 gap-1 text-[10px]">
                      {nomeById.get(m.ref_id) || m.ref_id.slice(0, 8)}
                      <button onClick={() => removeManual(m.id)}><X className="h-3 w-3" /></button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="flex items-center gap-2 font-medium">
              Prévia {previewing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Esta lista tem <strong>{preview?.total ?? 0}</strong> pessoa(s) —{" "}
              {preview?.contratados ?? 0} com contrato vigente, {preview?.voluntarios ?? 0} voluntário(s),{" "}
              {preview?.sem_telefone ?? 0} sem telefone válido.
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {Object.entries(preview?.por_cargo || {}).map(([k, v]) => (
                <Badge key={k} variant="outline" className="text-[10px]">{k}: {v}</Badge>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch id="aud-default" checked={isDefault} onCheckedChange={setIsDefault} />
            <Label htmlFor="aud-default" className="text-xs">
              Usar esta lista como padrão nas próximas missões
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Salvar lista
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
