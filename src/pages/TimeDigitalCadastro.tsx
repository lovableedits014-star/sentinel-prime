/* eslint-disable @typescript-eslint/no-explicit-any -- RPCs entram nos tipos gerados apos aplicar a migracao. */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Loader2, ShieldCheck, Users, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { fmtPhoneBR, isValidBRPhone, normalizeBRPhone } from "@/lib/phone-utils";

type PublicInfo = {
  ok: boolean;
  motivo?: string;
  grupo?: string;
  lider?: string;
  coordenador?: string | null;
  campanha?: string | null;
  logo_url?: string | null;
};

const errorMessage = (motivo?: string) =>
  ({
    link_invalido: "Este convite não existe ou foi desativado.",
    nome_invalido: "Informe seu nome completo.",
    telefone_invalido: "Informe um WhatsApp válido com DDD.",
    ja_vinculado:
      "Este WhatsApp já faz parte de outra equipe do Time Digital. Fale com a coordenação para corrigir o vínculo.",
  })[motivo || ""] || "Não foi possível concluir o cadastro.";

export default function TimeDigitalCadastro() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<PublicInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    document.title = "Entrar no Time Digital";
    if (!token) {
      setInfo({ ok: false, motivo: "link_invalido" });
      setLoading(false);
      return;
    }
    supabase.rpc("digital_group_public_info" as any, { p_token: token }).then(({ data, error }) => {
      setInfo(error ? { ok: false, motivo: "link_invalido" } : (data as unknown as PublicInfo));
      setLoading(false);
    });
  }, [token]);

  async function entrar() {
    const cleanName = nome.trim();
    const cleanPhone = normalizeBRPhone(telefone);
    if (cleanName.length < 3) return toast.error("Informe seu nome completo.");
    if (!isValidBRPhone(cleanPhone)) return toast.error("Informe um WhatsApp válido com DDD.");
    setSaving(true);
    const { data, error } = await supabase.rpc("digital_group_join" as any, {
      p_token: token,
      p_nome: cleanName,
      p_phone: cleanPhone,
    });
    setSaving(false);
    if (error) return toast.error("Não foi possível concluir o cadastro.");
    const result = data as any;
    if (!result?.ok) return toast.error(errorMessage(result?.motivo));
    setDone(true);
  }

  if (loading)
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );

  if (!info?.ok)
    return (
      <div className="min-h-screen grid place-items-center bg-muted/30 p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <AlertCircle className="mx-auto h-11 w-11 text-destructive" />
            <CardTitle>Convite indisponível</CardTitle>
            <CardDescription>{errorMessage(info?.motivo)}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );

  if (done)
    return (
      <div className="min-h-screen grid place-items-center bg-muted/30 p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-600" />
            <CardTitle>Você entrou no Time Digital!</CardTitle>
            <CardDescription>
              Seu WhatsApp foi vinculado à equipe {info.grupo}. Nas próximas missões, use este mesmo
              número para ser reconhecido.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-8">
      <div className="mx-auto max-w-md space-y-4">
        <Card>
          <CardHeader className="text-center">
            {info.logo_url && (
              <img
                src={info.logo_url}
                alt={info.campanha || "Campanha"}
                className="mx-auto mb-2 h-16 max-w-[220px] object-contain"
              />
            )}
            <Users className="mx-auto h-9 w-9 text-primary" />
            <CardTitle>Entrar no Time Digital</CardTitle>
            <CardDescription>
              Cadastre-se para participar das missões digitais da campanha.
            </CardDescription>
            <Badge variant="secondary" className="mx-auto mt-2">
              {info.grupo}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-2 text-center text-sm">
            <div>
              <span className="text-muted-foreground">Líder responsável:</span>{" "}
              <strong>{info.lider}</strong>
            </div>
            {info.coordenador && (
              <div>
                <span className="text-muted-foreground">Coordenação:</span>{" "}
                <strong>{info.coordenador}</strong>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Faça seu cadastro</CardTitle>
            <CardDescription>
              O grupo já está definido por este convite e não pode ser alterado.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome completo *</Label>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Seu nome"
                maxLength={100}
                autoComplete="name"
              />
            </div>
            <div className="space-y-1.5">
              <Label>WhatsApp com DDD *</Label>
              <Input
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                onBlur={(e) => setTelefone(fmtPhoneBR(normalizeBRPhone(e.target.value)))}
                placeholder="(67) 99999-9999"
                inputMode="tel"
                autoComplete="tel"
              />
            </div>
            <Button className="w-full" onClick={entrar} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Entrar no Time Digital
            </Button>
            <p className="flex items-start justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Seu telefone será usado para reconhecer sua participação nas missões.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
