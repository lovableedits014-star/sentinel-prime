/* eslint-disable @typescript-eslint/no-explicit-any -- RPCs/tabelas entram nos tipos gerados apos aplicar a migracao. */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronRight,
  Copy,
  Link2,
  Loader2,
  Power,
  Search,
  UserRoundPlus,
  Users,
} from "lucide-react";
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
  const [search, setSearch] = useState("");
  const [groupStatus, setGroupStatus] = useState<"active" | "inactive" | "all">("active");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

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
    queryKey: ["digital-group-members", clientId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("digital_group_members_list", {
        p_client_id: clientId,
        p_group_id: null,
      });
      if (error) throw error;
      return data || [];
    },
  });

  const membersByGroup = useMemo(() => {
    const result = new Map<string, MemberRow[]>();
    members.forEach((member) => {
      const rows = result.get(member.group_id) || [];
      rows.push(member);
      result.set(member.group_id, rows);
    });
    return result;
  }, [members]);

  const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
  const visibleGroups = useMemo(
    () =>
      groups.filter((group) => {
        if (groupStatus === "active" && !group.ativo) return false;
        if (groupStatus === "inactive" && group.ativo) return false;
        if (!normalizedSearch) return true;
        const groupMatches = `${group.grupo} ${group.coordenador || ""}`
          .toLocaleLowerCase("pt-BR")
          .includes(normalizedSearch);
        const memberMatches = (membersByGroup.get(group.group_id) || []).some((member) =>
          `${member.nome} ${member.telefone || ""}`
            .toLocaleLowerCase("pt-BR")
            .includes(normalizedSearch),
        );
        return groupMatches || memberMatches;
      }),
    [groups, groupStatus, normalizedSearch, membersByGroup],
  );

  const totals = useMemo(
    () => ({
      activeGroups: groups.filter((group) => group.ativo).length,
      members: groups.reduce((sum, group) => sum + Number(group.membros || 0), 0),
      activeMembers: groups.reduce((sum, group) => sum + Number(group.membros_ativos_30d || 0), 0),
      completed: groups.reduce((sum, group) => sum + Number(group.missoes_concluidas || 0), 0),
    }),
    [groups],
  );

  function toggleExpanded(groupId: string) {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

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

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Equipes ativas" value={totals.activeGroups} />
        <Metric label="Pessoas" value={totals.members} />
        <Metric label="Ativos nos últimos 30 dias" value={totals.activeMembers} />
        <Metric label="Missões concluídas" value={totals.completed} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gestão das equipes digitais</CardTitle>
          <CardDescription>
            Consulte cada coordenador e sua equipe no mesmo lugar. Abra uma equipe para acompanhar
            as pessoas, acessos, conclusões e última atividade.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[240px] flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar equipe, coordenador, pessoa ou WhatsApp"
              />
            </div>
            <Select
              value={groupStatus}
              onValueChange={(value) => setGroupStatus(value as typeof groupStatus)}
            >
              <SelectTrigger className="w-[190px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Equipes ativas</SelectItem>
                <SelectItem value="inactive">Equipes inativas</SelectItem>
                <SelectItem value="all">Todas as equipes</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="secondary" className="h-9 px-3">
              {visibleGroups.length} equipe(s)
            </Badge>
          </div>

          {isLoading ? (
            <div className="py-10 text-center">
              <Loader2 className="mx-auto h-6 w-6 animate-spin" />
            </div>
          ) : groups.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nenhum grupo do Time Digital criado.
            </p>
          ) : visibleGroups.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nenhuma equipe corresponde aos filtros.
            </p>
          ) : (
            <div className="divide-y overflow-hidden rounded-lg border">
              {visibleGroups.map((group) => {
                const groupMembers = membersByGroup.get(group.group_id) || [];
                const visibleMembers = !normalizedSearch
                  ? groupMembers
                  : groupMembers.filter((member) =>
                      `${member.nome} ${member.telefone || ""}`
                        .toLocaleLowerCase("pt-BR")
                        .includes(normalizedSearch),
                    );
                const expanded = expandedGroups.has(group.group_id) || Boolean(normalizedSearch);
                return (
                  <div
                    key={group.group_id}
                    className={!group.ativo ? "bg-muted/20 opacity-70" : ""}
                  >
                    <div className="flex flex-wrap items-center gap-3 p-3">
                      <button
                        type="button"
                        className="flex min-w-[240px] flex-1 items-center gap-2 text-left"
                        onClick={() => toggleExpanded(group.group_id)}
                      >
                        <ChevronRight
                          className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
                        />
                        <div>
                          <p className="font-semibold">{group.grupo}</p>
                          <p className="text-xs text-muted-foreground">
                            Coord. {group.coordenador || "não informado"}
                          </p>
                        </div>
                      </button>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <Badge variant={group.ativo ? "default" : "secondary"}>
                          {group.ativo ? "Ativa" : "Inativa"}
                        </Badge>
                        <Badge variant="outline">
                          <Users className="mr-1 h-3 w-3" />
                          {group.membros} pessoas
                        </Badge>
                        <Badge variant="outline">{group.membros_ativos_30d} ativos 30d</Badge>
                        <Badge variant="outline">{group.missoes_acessadas} acessos</Badge>
                        <Badge variant="outline" className="text-emerald-700">
                          {group.missoes_concluidas} concluídas
                        </Badge>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => copyInvite(group)}
                          disabled={!group.ativo}
                        >
                          <Copy className="mr-1 h-3.5 w-3.5" />
                          Convite
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => toggleGroup.mutate(group)}>
                          <Power className="mr-1 h-3.5 w-3.5" />
                          {group.ativo ? "Desativar" : "Ativar"}
                        </Button>
                      </div>
                    </div>

                    {expanded && (
                      <div className="border-t bg-muted/10 px-3 pb-3">
                        {groupMembers.length === 0 ? (
                          <p className="py-5 text-center text-sm text-muted-foreground">
                            Nenhuma pessoa cadastrada nesta equipe.
                          </p>
                        ) : visibleMembers.length === 0 ? (
                          <p className="py-5 text-center text-sm text-muted-foreground">
                            A equipe corresponde à busca, mas nenhum membro individual corresponde.
                          </p>
                        ) : (
                          <div className="divide-y">
                            {visibleMembers.map((member) => (
                              <div
                                key={member.member_id}
                                className="grid gap-2 py-3 text-sm md:grid-cols-[1fr_160px_120px_190px] md:items-center"
                              >
                                <div>
                                  <p className="font-medium">{member.nome}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {fmtPhoneBR(member.telefone)}
                                  </p>
                                </div>
                                <p className="text-xs">{member.missoes_acessadas} acesso(s)</p>
                                <p className="text-xs">
                                  {member.missoes_concluidas > 0 ? (
                                    <span className="inline-flex items-center gap-1 text-emerald-700">
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                      {member.missoes_concluidas} concluída(s)
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">Nenhuma conclusão</span>
                                  )}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {member.ultimo_acesso
                                    ? `Última atividade: ${new Date(member.ultimo_acesso).toLocaleString("pt-BR")}`
                                    : "Ainda não acessou"}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-2xl font-bold">{value || 0}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}
