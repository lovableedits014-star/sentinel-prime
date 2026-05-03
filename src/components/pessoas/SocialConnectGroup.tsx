import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import SocialConnectFlow, { type ConnectedSocial } from "./SocialConnectFlow";

export interface SocialEntry {
  plataforma: string;
  usuario: string;
  url_perfil: string;
}

interface Props {
  /** Nome digitado no formulário (mantido para compat — não é mais usado no fluxo atual). */
  searchName?: string;
  /** Callback com array no formato esperado pelas Edge Functions de registro. */
  onSocialsChange: (entries: SocialEntry[]) => void;
  /** Texto opcional acima dos botões. */
  helperText?: string;
}

/**
 * Componente reutilizável de captura de redes sociais (Instagram + Facebook).
 * Padroniza o fluxo "Conectar minha rede" usado em todos os cadastros públicos
 * (apoiador, funcionário, contratado, etc).
 */
export default function SocialConnectGroup({
  searchName = "",
  onSocialsChange,
  helperText = "Conecte suas redes para receber missões de interação 😊",
}: Props) {
  const [instagram, setInstagram] = useState<ConnectedSocial | null>(null);
  const [facebook, setFacebook] = useState<ConnectedSocial | null>(null);

  useEffect(() => {
    const list: SocialEntry[] = [];
    if (instagram) {
      list.push({
        plataforma: "instagram",
        usuario: instagram.handle.replace(/^@/, ""),
        url_perfil: instagram.url,
      });
    }
    if (facebook) {
      list.push({
        plataforma: "facebook",
        usuario: facebook.handle,
        url_perfil: facebook.url,
      });
    }
    onSocialsChange(list);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instagram, facebook]);

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Redes Sociais (opcional)</Label>
      {helperText && <p className="text-xs text-muted-foreground">{helperText}</p>}
      <div className="space-y-2">
        <SocialConnectFlow
          platform="instagram"
          searchName={searchName}
          value={instagram}
          onChange={setInstagram}
        />
        <SocialConnectFlow
          platform="facebook"
          searchName={searchName}
          value={facebook}
          onChange={setFacebook}
        />
      </div>
    </div>
  );
}