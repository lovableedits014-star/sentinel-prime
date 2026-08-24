import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CalendarDays, MapPin, Clock, CheckCircle2, Loader2, Users, AlertCircle } from "lucide-react";
import { normalizeBRPhone, isValidBRPhone, fmtPhoneBR } from "@/lib/phone-utils";

type Sessao = {
  id: string; label: string; hora_inicio: string | null; hora_fim: string | null;
  vagas: number; ordem: number; ocupadas: number;
};
type Info = {
  ok: boolean; motivo?: string;
  reuniao_id?: string; titulo?: string; data_reuniao?: string; local?: string | null;
  observacoes?: string | null; grupo_label?: string | null;
  candidato_nome?: string | null; candidato_logo?: string | null;
  sessoes?: Sessao[];
};

const MOTIVOS: Record<string, string> = {
  token_invalido: "Este link de confirmação não é válido.",
  link_desativado: "Este link foi desativado pela organização.",
  reuniao_inexistente: "Reunião não encontrada.",
  inscricoes_encerradas: "As inscrições desta reunião foram encerradas.",
  sessao_invalida: "Horário inválido, atualize a página.",
  sessao_lotada: "Este horário acabou de lotar. Escolha outro horário.",
  telefone_invalido: "Informe um telefone válido com DDD.",
  nome_invalido: "Informe seu nome completo.",
};

const fmtDate = (d?: string) => {
  if (!d) return "";
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y}`;
};
const fmtHora = (h: string | null | undefined) => (h ? h.slice(0, 5) : "");

export default function ReuniaoPublica() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<Info | null>(null);
  const [loading, setLoading] = useState(true);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [sessaoId, setSessaoId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ label: string; atualizado: boolean } | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const { data, error } = await supabase.rpc("reuniao_info_token" as any, { _token: token });
    if (error) {
      setInfo({ ok: false, motivo: "token_invalido" });
    } else {
      setInfo(data as any as Info);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { document.title = "Confirmação de presença"; }, []);

  async function confirmar() {
    if (!token) return;
    if (nome.trim().length < 3) return toast.error("Informe seu nome completo.");
    const tel = normalizeBRPhone(telefone);
    if (!isValidBRPhone(tel)) return toast.error("Informe um telefone válido com DDD.");
    if (!sessaoId) return toast.error("Escolha um horário.");
    setSaving(true);
    const { data, error } = await supabase.rpc("reuniao_inscrever_token" as any, {
      _token: token, _nome: nome.trim(), _telefone: tel, _sessao_id: sessaoId,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    const res = data as any;
    if (!res?.ok) {
      toast.error(MOTIVOS[res?.motivo] || "Não foi possível confirmar.");
      load();
      return;
    }
    setDone({ label: res.sessao_label, atualizado: !!res.atualizado });
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!info?.ok) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <AlertCircle className="w-10 h-10 mx-auto text-destructive mb-2" />
            <CardTitle>Não foi possível abrir</CardTitle>
            <CardDescription>{MOTIVOS[info?.motivo || ""] || "Link indisponível."}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const sessoes = (info.sessoes || []).slice().sort((a, b) => a.ordem - b.ordem);

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-600 mb-2" />
            <CardTitle>{done.atualizado ? "Presença atualizada!" : "Presença confirmada!"}</CardTitle>
            <CardDescription>
              {info.titulo} — {fmtDate(info.data_reuniao)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-center text-sm">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Seu horário</div>
              <div className="text-lg font-semibold">{done.label}</div>
            </div>
            {info.local && (
              <div className="flex items-center justify-center gap-1.5 text-muted-foreground">
                <MapPin className="w-4 h-4" /> {info.local}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Guarde este horário. Se precisar trocar, abra o link novamente e confirme com o mesmo telefone.
            </p>
            <Button variant="outline" className="w-full" onClick={() => { setDone(null); load(); }}>
              Alterar meu horário
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-md mx-auto space-y-4">
        <Card>
          <CardHeader className="text-center">
            {info.candidato_logo && (
              <img src={info.candidato_logo} alt={info.candidato_nome || "Campanha"} className="h-14 mx-auto object-contain mb-2" />
            )}
            <CardTitle className="text-xl">{info.titulo}</CardTitle>
            <CardDescription className="space-y-1">
              <span className="flex items-center justify-center gap-1.5"><CalendarDays className="w-4 h-4" /> {fmtDate(info.data_reuniao)}</span>
              {info.local && <span className="flex items-center justify-center gap-1.5"><MapPin className="w-4 h-4" /> {info.local}</span>}
            </CardDescription>
            {info.grupo_label && <Badge variant="outline" className="mx-auto text-[10px] mt-1">{info.grupo_label}</Badge>}
          </CardHeader>
          {info.observacoes && (
            <CardContent className="pt-0">
              <p className="text-sm text-muted-foreground whitespace-pre-wrap text-center">{info.observacoes}</p>
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Confirme sua presença</CardTitle>
            <CardDescription>Preencha seus dados e escolha o horário em que poderá comparecer.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs">Nome completo *</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" />
            </div>
            <div>
              <Label className="text-xs">WhatsApp com DDD *</Label>
              <Input
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                onBlur={(e) => setTelefone(fmtPhoneBR(normalizeBRPhone(e.target.value)))}
                placeholder="(67) 99999-9999"
                inputMode="tel"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Escolha o horário *</Label>
              {sessoes.map((s) => {
                const restantes = Math.max(0, s.vagas - s.ocupadas);
                const lotado = restantes === 0;
                const active = sessaoId === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={lotado}
                    onClick={() => setSessaoId(s.id)}
                    className={`w-full text-left rounded-lg border p-3 transition ${
                      active ? "border-primary bg-primary/5" : "hover:border-primary/40"
                    } ${lotado ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="font-medium text-sm flex items-center gap-1.5">
                          <Clock className="w-4 h-4 text-primary" /> {s.label}
                        </div>
                        {s.hora_inicio && (
                          <div className="text-xs text-muted-foreground pl-5">
                            {fmtHora(s.hora_inicio)}{s.hora_fim ? ` às ${fmtHora(s.hora_fim)}` : ""}
                          </div>
                        )}
                      </div>
                      <Badge variant={lotado ? "destructive" : "outline"} className="text-[10px]">
                        <Users className="w-3 h-3 mr-1" />
                        {lotado ? "Lotado" : `${restantes} vaga(s)`}
                      </Badge>
                    </div>
                  </button>
                );
              })}
            </div>

            <Button className="w-full" onClick={confirmar} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Confirmar presença
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">
              Já confirmou? Preencha novamente com o mesmo telefone para trocar de horário.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
