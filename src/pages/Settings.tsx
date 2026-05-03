import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings as SettingsIcon } from "lucide-react";
import TeamUsersPanel from "@/components/team/TeamUsersPanel";
import WhatsAppConfigCard from "@/components/settings/WhatsAppConfigCard";
import WhatsAppPoolManager from "@/components/settings/WhatsAppPoolManager";
import TelemarketingSettingsCard from "@/components/settings/TelemarketingSettingsCard";
import IntegrationsPanel from "@/components/settings/IntegrationsPanel";
import PublicLinksCard from "@/components/settings/PublicLinksCard";
import UsageEstimatePanel from "@/components/settings/UsageEstimatePanel";
import CampaignFramesCard from "@/components/settings/CampaignFramesCard";
import PresenceSettingsCard from "@/components/settings/PresenceSettingsCard";
import CampaignIdentityCard from "@/components/settings/CampaignIdentityCard";
import CandidateAssetsCard from "@/components/settings/CandidateAssetsCard";

const SUPER_ADMIN_EMAIL = "lovableedits014@gmail.com";

const Settings = () => {
  const [clientId, setClientId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    const fetchClient = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setIsSuperAdmin(user.email === SUPER_ADMIN_EMAIL);
      const { data } = await supabase
        .from("clients")
        .select("id, name")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      if (data) {
        setClientId(data.id);
      }
      setLoading(false);
    };
    fetchClient();
  }, []);

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Configure suas integrações com WhatsApp (envio de mensagens), Meta (Facebook e Instagram), modelos de IA e gerencie os membros da sua equipe com diferentes níveis de acesso.
        </p>
      </div>

      {/* Pool de Instâncias WhatsApp (anti-banimento) */}
      {clientId && <CampaignIdentityCard clientId={clientId} />}

      {/* Logo + galeria de fotos para o gerador de artes IA */}
      {clientId && <CandidateAssetsCard clientId={clientId} />}

      {clientId && <WhatsAppPoolManager clientId={clientId} />}

      {/* Consumo & Custos — apenas Super Admin */}
      {clientId && isSuperAdmin && <UsageEstimatePanel clientId={clientId} />}

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
