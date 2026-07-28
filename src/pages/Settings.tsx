import { useActiveClientId } from "@/hooks/useActiveClientId";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings as SettingsIcon, Loader2, ShieldAlert } from "lucide-react";
import TeamUsersPanel from "@/components/team/TeamUsersPanel";
import WhatsAppConfigCard from "@/components/settings/WhatsAppConfigCard";
import WhatsAppPoolManager from "@/components/settings/WhatsAppPoolManager";
import TelemarketingSettingsCard from "@/components/settings/TelemarketingSettingsCard";
import IntegrationsPanel from "@/components/settings/IntegrationsPanel";
import PublicLinksCard from "@/components/settings/PublicLinksCard";

import CampaignFramesCard from "@/components/settings/CampaignFramesCard";
import PresenceSettingsCard from "@/components/settings/PresenceSettingsCard";
import CampaignIdentityCard from "@/components/settings/CampaignIdentityCard";
import CandidateAssetsCard from "@/components/settings/CandidateAssetsCard";
import PublicBaseUrlCard from "@/components/settings/PublicBaseUrlCard";
import { useIsSuperAdmin } from "@/hooks/useIsSuperAdmin";

const Settings = () => {
  const { clientId, isLoading, isSuperAdmin: isSA, isImpersonating, needsClientSelection } = useActiveClientId();
  const { isSuperAdmin } = useIsSuperAdmin();
  void isSuperAdmin;
  void isSA;

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Configure suas integrações com WhatsApp (envio de mensagens), Meta (Facebook e Instagram), modelos de IA e gerencie os membros da sua equipe com diferentes níveis de acesso.
        </p>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Carregando contexto...
        </div>
      )}

      {!isLoading && needsClientSelection && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-4 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-amber-900 dark:text-amber-200">Selecione um cliente</p>
            <p className="text-amber-800/80 dark:text-amber-300/80 mt-0.5">
              Você está como Super Admin sem nenhum cliente selecionado. Use o seletor de gerente no menu lateral antes de configurar instâncias — caso contrário, as alterações ficariam em um cliente errado.
            </p>
          </div>
        </div>
      )}

      {!isLoading && isImpersonating && clientId && (
        <div className="rounded-lg border border-amber-400 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-4 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-amber-900 dark:text-amber-200">Modo Super Admin — atuando em nome de outro cliente</p>
            <p className="text-amber-800/80 dark:text-amber-300/80 mt-0.5">
              Tudo que você criar aqui (instâncias de WhatsApp, integrações, equipe) ficará vinculado ao cliente atualmente selecionado no seletor lateral. Confirme se é o cliente correto antes de prosseguir.
            </p>
          </div>
        </div>
      )}


      {/* Pool de Instâncias WhatsApp (anti-banimento) */}
      {clientId && <CampaignIdentityCard clientId={clientId} />}
      {clientId && <PublicBaseUrlCard clientId={clientId} />}

      {/* Logo + galeria de fotos para o gerador de artes IA */}
      {clientId && <CandidateAssetsCard clientId={clientId} />}

      {clientId && <WhatsAppPoolManager clientId={clientId} />}

      {/* WhatsApp Oficial */}
      {clientId && <WhatsAppConfigCard clientId={clientId} />}

      {/* Links de Acesso Público */}
      {clientId && <PublicLinksCard clientId={clientId} />}

      {/* Molduras de Foto de Campanha */}
      {clientId && <CampaignFramesCard clientId={clientId} />}

      {/* Controle de Presença Diária */}
      {clientId && <PresenceSettingsCard clientId={clientId} />}

      {/* Telemarketing Module */}
      {clientId && <TelemarketingSettingsCard clientId={clientId} />}

      {/* Team Users Management */}
      {clientId && <TeamUsersPanel clientId={clientId} />}

      {/* Integrações (Meta, IA, etc.) */}
      {clientId && <IntegrationsPanel clientId={clientId} />}
    </div>
  );
};

export default Settings;
