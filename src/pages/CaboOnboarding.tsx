import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  CheckCircle2,
  ContactRound,
  Loader2,
  LockKeyhole,
  MessageCircle,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import CampaignFrameGenerator from "@/components/campaign-frame/CampaignFrameGenerator";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client-selfhosted";

type Grupo = { chave: string; nome: string; link: string };
type Jornada = {
  ok: boolean;
  error?: string;
  client_id: string;
  pessoa_nome: string;
  campanha_nome: string;
  logo_url: string | null;
  escritorio_nome: string;
  escritorio_telefone: string | null;
  candidato_nome: string;
  candidato_telefone: string | null;
  mensagem: string;
  grupos: Grupo[];
  grupo_chave: string | null;
  grupo_nome: string | null;
  grupo_link: string | null;
  grupo_escolhido_em: string | null;
};

const waUrl = (phone: string | null, message: string) => {
  const digits = (phone || "").replace(/\D/g, "");
  if (!digits) return null;
  const normalized = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
};

const vcard = (name: string, phone: string) =>
  [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${name}`,
    `TEL;TYPE=CELL:${phone.replace(/\D/g, "")}`,
    "END:VCARD",
  ].join("\r\n");

export default function CaboOnboarding() {
  const { token = "" } = useParams();
  const [data, setData] = useState<Jornada | null>(null);
  const [loading, setLoading] = useState(true);
  const [choosing, setChoosing] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const { data: result, error } = await (supabase as any).rpc("eleicao_cabo_onboarding_info", {
        p_token: token,
      });
      setLoading(false);
      if (error) return toast.error(error.message);
      setData(result as Jornada);
    })();
  }, [token]);

  const contacts = useMemo(
    () =>
      data
        ? [
            { key: "escritorio", name: data.escritorio_nome, phone: data.escritorio_telefone },
            { key: "candidato", name: data.candidato_nome, phone: data.candidato_telefone },
          ]
        : [],
    [data],
  );

  const saveContacts = () => {
    const valid = contacts.filter((contact) => contact.phone);
    if (!valid.length) return toast.error("Os contatos oficiais ainda não foram configurados.");
    const blob = new Blob(
      [valid.map((contact) => vcard(contact.name, contact.phone!)).join("\r\n")],
      { type: "text/vcard;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "contatos-oficiais.vcf";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success("Arquivo com os dois contatos pronto para salvar na agenda.");
  };

  const sendHello = (key: string, phone: string | null) => {
    if (!data) return;
    const url = waUrl(phone, data.mensagem);
    if (!url) return toast.error("Este número ainda não foi configurado.");
    setSent((current) => new Set(current).add(key));
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const chooseGroup = async (group: Grupo) => {
    if (!data || data.grupo_chave) return;
    if (
      !window.confirm(
        `Confirmar o grupo “${group.nome}”? Depois desta escolha os demais serão bloqueados.`,
      )
    )
      return;
    setChoosing(group.chave);
    const { data: result, error } = await (supabase as any).rpc(
      "eleicao_cabo_onboarding_choose_group",
      {
        p_token: token,
        p_grupo_chave: group.chave,
      },
    );
    setChoosing(null);
    if (error || !result?.ok)
      return toast.error(error?.message || result?.error || "Não foi possível escolher o grupo.");
    setData((current) =>
      current
        ? {
            ...current,
            grupo_chave: result.grupo_chave,
            grupo_nome: result.grupo_nome,
            grupo_link: result.link || current.grupo_link,
          }
        : current,
    );
    if (result.link) window.location.href = result.link;
    else toast.info(`Seu grupo já está definido como ${result.grupo_nome}.`);
  };

  if (loading)
    return (
      <main className="grid min-h-dvh place-items-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </main>
    );
  if (!data?.ok)
    return (
      <main className="grid min-h-dvh place-items-center bg-muted/30 p-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Link indisponível</CardTitle>
            <CardDescription>
              {data?.error || "Confira o endereço recebido e tente novamente."}
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );

  return (
    <main className="min-h-dvh bg-gradient-to-b from-primary/10 via-background to-background px-3 py-6 sm:py-10">
      <div className="mx-auto max-w-2xl space-y-4">
        <header className="space-y-2 text-center">
          {data.logo_url && (
            <img
              src={data.logo_url}
              alt=""
              className="mx-auto h-16 w-16 rounded-full object-cover shadow"
            />
          )}
          <p className="text-sm font-medium text-primary">{data.campanha_nome}</p>
          <h1 className="text-2xl font-bold">Bem-vindo(a), {data.pessoa_nome.split(" ")[0]}!</h1>
          <p className="text-sm text-muted-foreground">
            Conclua os três passos abaixo. Leva menos de dois minutos.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ContactRound className="h-5 w-5 text-primary" /> 1. Salve os contatos oficiais
            </CardTitle>
            <CardDescription>
              O botão cria um arquivo com os dois números para adicionar à agenda do celular.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full gap-2" size="lg" onClick={saveContacts}>
              <ContactRound className="h-5 w-5" /> Salvar os 2 contatos na agenda
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MessageCircle className="h-5 w-5 text-emerald-600" /> 2. Envie um “olá” para os dois
              números
            </CardTitle>
            <CardDescription>
              A mensagem já está pronta. Toque em cada botão e confirme o envio no WhatsApp.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {contacts.map((contact) => (
              <Button
                key={contact.key}
                variant={sent.has(contact.key) ? "outline" : "default"}
                className="h-auto min-h-14 gap-2 py-3"
                onClick={() => sendHello(contact.key, contact.phone)}
                disabled={!contact.phone}
              >
                {sent.has(contact.key) ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                ) : (
                  <MessageCircle className="h-5 w-5" />
                )}
                <span className="text-left">
                  <span className="block text-xs opacity-75">Enviar para</span>
                  {contact.name}
                </span>
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <UsersRound className="h-5 w-5 text-primary" /> 3. Escolha seu grupo regional
            </CardTitle>
            <CardDescription>
              Escolha com atenção: depois de entrar, os outros grupos serão bloqueados
              definitivamente neste cadastro.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.grupo_chave ? (
              <div className="space-y-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
                <div className="flex items-center gap-3">
                  <LockKeyhole className="h-6 w-6 text-emerald-600" />
                  <div>
                    <p className="font-semibold">Grupo definido</p>
                    <p className="text-sm text-muted-foreground">{data.grupo_nome}</p>
                  </div>
                </div>
                {data.grupo_link && (
                  <Button
                    className="w-full gap-2"
                    onClick={() => {
                      window.location.href = data.grupo_link!;
                    }}
                  >
                    <UsersRound className="h-4 w-4" /> Abrir meu grupo novamente
                  </Button>
                )}
              </div>
            ) : data.grupos.length ? (
              data.grupos.map((group) => (
                <Button
                  key={group.chave}
                  variant="outline"
                  className="w-full justify-between py-5"
                  disabled={!!choosing}
                  onClick={() => chooseGroup(group)}
                >
                  <span>{group.nome}</span>
                  {choosing === group.chave ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UsersRound className="h-4 w-4" />
                  )}
                </Button>
              ))
            ) : (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Os grupos ainda não foram configurados pela campanha.
              </p>
            )}
          </CardContent>
        </Card>

        <CampaignFrameGenerator
          clientId={data.client_id}
          variant="showcase"
          individualOnly
          hideWithoutActiveFrame
        />
      </div>
    </main>
  );
}
