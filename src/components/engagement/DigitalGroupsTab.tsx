/* eslint-disable @typescript-eslint/no-explicit-any -- RPCs/tabelas entram nos tipos gerados apos aplicar a migracao. */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Copy, Link2, Loader2, Power, UserRoundPlus, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { resolvePublicBaseUrl } from "@/lib/public-base-url";
import { fmtPhoneBR, isValidBRPhone, normalizeBRPhone } from "@/lib/phone-utils";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Person = { id: string; nome: string; tipo: string; telefone: string | null };
type GroupRow = {
  group_id: string;
  grupo: string;
  ativo: boolean;
  invite_token: string;
  leader_person_id: string;
  coordinator_person_id: string;
  coordenador: string;
  membros: number;
  membros_ativos_30d: number;
  missoes_acessadas: number;
  missoes_concluidas: number;
};
type MemberRow = {
  member_id: string;
  group_id: string;
  grupo: string;
  participant_id: string;
  nome: string;
  telefone: string;
  status: string;
  joined_at: string;
  missoes_acessadas: number;
  missoes_concluidas: number;
  ultimo_acesso: string | null;
};

export default function DigitalGroupsTab({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [coordinatorId, setCoordinatorId] = useState("");
  const [coordinatorName, setCoordinatorName] = useState("");
  const [coordinatorPhone, setCoordinatorPhone] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<string>("all");

  const { data: client } = useQuery({
    queryKey: ["digital-groups-client", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id,public_base_url")
        .eq("id", clientId)
        .single();
      if (error) throw error;
      return data;
    },
  });
  const baseUrl = useMemo(() => resolvePublicBaseUrl(client).url, [client]);

  const { data: people = [] } = useQuery<Person[]>({
    queryKey: ["digital-groups-people", clientId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("eleicao_pessoas")
        .select("id,nome,tipo,telefone")
        .eq("client_id", clientId)
        .order("nome");
      if (error) throw error;
      return data || [];
    },
  });
  const coordinators = people.filter((p) => p.tipo === "coordenador");

  const { data: groups = [], isLoading } = useQuery<GroupRow[]>({
    queryKey: ["digital-groups", clientId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("digital_group_dashboard", {
        p_client_id: clientId,
      });
      if (error) throw error;
      return data || [];
    },
  });
  const { data: members = [] } = useQuery<MemberRow[]>({
    queryKey: ["digital-group-members", clientId, selectedGroup],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("digital_group_members_list", {
        p_client_id: clientId,
        p_group_id: selectedGroup === "all" ? null : selectedGroup,
      });
      if (error) throw error;
      return data || [];
    },
  });

  const createGroup = useMutation({
    mutationFn: async () => {
      const isNewCoordinator = coordinatorId === "__novo__";
      if (isNewCoordinator && coordinatorName.trim().length < 3)
        throw new Error("Informe o nome do novo coordenador.");
      if (isNewCoordinator && !isValidBRPhone(coordinatorPhone))
        throw new Error("Informe um WhatsApp válido para o novo coordenador.");
      if (nome.trim().length < 2 || !coordinatorId)
        throw new Error("Informe o grupo e o coordenador.");
      const { error } = await (supabase as any).from("engagement_digital_groups").insert({
        client_id: clientId,
        nome: nome.trim(),
        leader_person_id: null,
        coordinator_person_id: isNewCoordinator ? null : coordinatorId,
        coordinator_name: isNewCoordinator ? coordinatorName.trim() : null,
        coordinator_phone: isNewCoordinator ? normalizeBRPhone(coordinatorPhone) : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNome("");
      setCoordinatorId("");
      setCoordinatorName("");
      setCoordinatorPhone("");
      qc.invalidateQueries({ queryKey: ["digital-groups", clientId] });
      toast.success("Grupo criado e link gerado.");
    },
    onError: (e: any) => toast.error(e?.message || "Não foi possível criar o grupo."),
  });

  const toggleGroup = useMutation({
    mutationFn: async (g: GroupRow) => {
      const { error } = await (supabase as any)
        .from("engagement_digital_groups")
        .update({ ativo: !g.ativo })
        .eq("id", g.group_id)
        .eq("client_id", clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["digital-groups", clientId] });
      toast.success("Status atualizado.");
    },
    onError: (e: any) => toast.error(e?.message || "Não foi possível atualizar."),
  });

  async function copyInvite(g: GroupRow) {
    const link = `${baseUrl}/time-digital/${g.invite_token}`;
    await navigator.clipboard.writeText(link);
    toast.success("Link de cadastro copiado.");
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserRoundPlus className="h-5 w-5" />
            Grupos do Time Digital
          </CardTitle>
          <CardDescription>
            Crie um convite permanente. Quem se cadastrar ficará vinculado ao coordenador definido
            aqui.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 md:items-end">
          <div className="space-y-1.5">
            <Label>Nome do grupo</Label>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Apoiadores de Aquidauana"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Coordenador</Label>
            <Select value={coordinatorId} onValueChange={setCoordinatorId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__novo__">+ Cadastrar novo coordenador</SelectItem>
                {coordinators.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {coordinatorId === "__novo__" && (
            <>
              <div className="space-y-1.5">
                <Label>Nome do novo coordenador</Label>
                <Input
                  value={coordinatorName}
                  onChange={(e) => setCoordinatorName(e.target.value)}
                  placeholder="Nome completo"
                  maxLength={100}
                />
              </div>
              <div className="space-y-1.5">
                <Label>WhatsApp do coordenador</Label>
                <Input
                  value={coordinatorPhone}
                  onChange={(e) => setCoordinatorPhone(e.target.value)}
                  onBlur={(e) => setCoordinatorPhone(fmtPhoneBR(normalizeBRPhone(e.target.value)))}
                  placeholder="(67) 99999-9999"
                  inputMode="tel"
                />
              </div>
              <p className="self-center text-xs text-muted-foreground lg:col-span-2">
                Este coordenador existirÃ¡ somente no Time Digital. Nenhum contrato ou cadastro
                eleitoral serÃ¡ criado.
              </p>
            </>
          )}
          <Button onClick={() => createGroup.mutate()} disabled={createGroup.isPending}>
            {createGroup.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Link2 className="mr-2 h-4 w-4" />
            )}
            Gerar link
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="py-10 text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin" />
        </div>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhum grupo do Time Digital criado.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {groups.map((g) => (
            <Card key={g.group_id} className={!g.ativo ? "opacity-65" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{g.grupo}</CardTitle>
                    <CardDescription>Coord. {g.coordenador || "não informado"}</CardDescription>
                  </div>
                  <Badge variant={g.ativo ? "default" : "secondary"}>
                    {g.ativo ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <Metric label="Pessoas" value={g.membros} />
                  <Metric label="Ativos 30d" value={g.membros_ativos_30d} />
                  <Metric label="Acessos" value={g.missoes_acessadas} />
                  <Metric label="Concluídas" value={g.missoes_concluidas} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyInvite(g)}
                    disabled={!g.ativo}
                  >
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    Copiar convite
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setSelectedGroup(g.group_id);
                      document
                        .getElementById("digital-members")
                        ?.scrollIntoView({ behavior: "smooth" });
                    }}
                  >
                    <Users className="mr-1.5 h-3.5 w-3.5" />
                    Ver pessoas
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => toggleGroup.mutate(g)}>
                    <Power className="mr-1.5 h-3.5 w-3.5" />
                    {g.ativo ? "Desativar" : "Ativar"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card id="digital-members">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Pessoas captadas</CardTitle>
              <CardDescription>
                Participantes externos reconhecidos pelo telefone nas missões atuais.
              </CardDescription>
            </div>
            <Select value={selectedGroup} onValueChange={setSelectedGroup}>
              <SelectTrigger className="w-[240px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os grupos</SelectItem>
                {groups.map((g) => (
                  <SelectItem key={g.group_id} value={g.group_id}>
                    {g.grupo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma pessoa cadastrada neste grupo.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs">
                  <tr>
                    <th className="p-2 text-left">Pessoa</th>
                    <th className="p-2 text-left">Grupo</th>
                    <th className="p-2 text-left">WhatsApp</th>
                    <th className="p-2 text-right">Acessou</th>
                    <th className="p-2 text-right">Concluiu</th>
                    <th className="p-2 text-left">Última atividade</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.member_id} className="border-t">
                      <td className="p-2 font-medium">{m.nome}</td>
                      <td className="p-2">{m.grupo}</td>
                      <td className="p-2 text-muted-foreground">{fmtPhoneBR(m.telefone)}</td>
                      <td className="p-2 text-right">{m.missoes_acessadas}</td>
                      <td className="p-2 text-right">
                        {m.missoes_concluidas > 0 ? (
                          <span className="inline-flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            {m.missoes_concluidas}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="p-2 text-xs text-muted-foreground">
                        {m.ultimo_acesso
                          ? new Date(m.ultimo_acesso).toLocaleString("pt-BR")
                          : "Ainda não acessou"}
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
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-muted/50 p-2">
      <div className="text-lg font-semibold">{value || 0}</div>
      <div className="text-muted-foreground">{label}</div>
    </div>
  );
}
