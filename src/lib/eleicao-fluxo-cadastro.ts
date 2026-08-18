import { supabase } from "@/integrations/supabase/client-selfhosted";

/**
 * Helper para reenvio MANUAL do fluxo de cadastro pelo WhatsApp Web do próprio
 * usuário. Replica a mesma resolução de coordenador, região, link de grupo e
 * templates usada pela edge function `eleicao-notify-novo-lider`, mas roda
 * 100% no cliente e abre `https://wa.me/...?text=...` em nova aba — sem
 * depender da instância WhatsApp da campanha.
 */

export type FluxoTipo = "coordenador" | "lider" | "cabo";

export interface FluxoPessoa {
  id: string;
  client_id: string;
  tipo: FluxoTipo;
  escopo: "campo_grande" | "interior" | string | null;
  regiao: string | null;
  nome: string;
  telefone: string | null;
  endereco: string | null;
  rua: string | null;
  numero: string | null;
  bairro: string | null;
  parent_id: string | null;
}

export interface FluxoDestino {
  /** false = pode abrir wa.me ; true = item desabilitado */
  disabled: boolean;
  /** motivo curto pra tooltip quando disabled */
  motivo?: string;
  /** nome humano do destinatário, pra mostrar no item */
  nome: string;
  /** telefone bruto (com ou sem DDI) */
  telefone: string | null;
  /** telefone formatado pra UI: (67) 99999-9999 */
  telefoneFmt: string | null;
  /** mensagem já com placeholders substituídos */
  mensagem: string;
  /** URL pronta pra abrir em nova aba (ou null se disabled) */
  waUrl: string | null;
}

export interface FluxoResolvido {
  coordenador: FluxoDestino;
  cadastrado: FluxoDestino;
  secretaria: FluxoDestino;
}

// ─── Helpers de telefone (espelham a edge) ──────────────────────────────────
function onlyDigits(s: string | null | undefined) {
  return String(s ?? "").replace(/\D/g, "");
}

function waPhone(raw: string | null | undefined): string {
  const d = onlyDigits(raw);
  if (!d) return "";
  if (d.startsWith("55")) return d;
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return d;
}

export function fmtPhone(s: string | null | undefined) {
  const d = onlyDigits(s);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 13 && d.startsWith("55")) return fmtPhone(d.slice(2));
  if (d.length === 12 && d.startsWith("55")) return fmtPhone(d.slice(2));
  return s ?? "";
}

function applyTemplate(tpl: string, vars: Record<string, string>) {
  return (tpl || "").replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

const REGIAO_LABELS_FALLBACK: Record<string, string> = {
  centro: "Centro", segredo: "Segredo", prosa: "Prosa", bandeira: "Bandeira",
  anhanduizinho: "Anhanduizinho", lagoa: "Lagoa", imbirussu: "Imbirussu", moreninha: "Moreninha",
};

// Defaults idênticos ao da edge `eleicao-notify-novo-lider`.
const DEFAULT_TEMPLATE_COORDENADOR =
  "📢 Novo cadastro na região *{regiao}*:\n\nNome: {nome}\nTelefone: {telefone}\nEndereço: {rua}, {numero} — {bairro}";
const DEFAULT_TEMPLATE_LIDER =
  "Olá {nome}! Você foi cadastrado como líder da região *{regiao}*.\n\nEntre no grupo da sua região para receber as próximas instruções:\n{link_grupo}";
const DEFAULT_TEMPLATE_COORD_BV =
  "Olá {nome}! Você foi cadastrado como coordenador da região *{regiao}*.\n\nEntre no grupo da sua região e aguarde as próximas instruções:\n{link_grupo}";
const DEFAULT_TEMPLATE_CABO_BV =
  "Olá {nome}! Você foi cadastrado como cabo eleitoral na região *{regiao}*.\n\nEntre no grupo da sua região para receber as próximas instruções:\n{link_grupo}";

function buildWaUrl(rawPhone: string | null | undefined, message: string): string | null {
  const phone = waPhone(rawPhone || "");
  if (!phone) return null;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function destinoDesabilitado(nome: string, motivo: string): FluxoDestino {
  return {
    disabled: true, motivo, nome,
    telefone: null, telefoneFmt: null,
    mensagem: "", waUrl: null,
  };
}

/**
 * Resolve as 3 mensagens (Coordenador / Cadastrado / Secretaria) prontas pra
 * serem abertas no WhatsApp Web. Faz no máximo 4 selects (config, região,
 * coordenador favorito, parent chain). Seguro contra RLS — quem chama está na
 * tela de Eleição (dono ou team_member).
 */
export async function resolverFluxoCadastro(p: FluxoPessoa): Promise<FluxoResolvido> {
  // 1. Config da campanha (templates + secretaria + grupos)
  const { data: cfgRow } = await supabase
    .from("eleicao_notif_config" as any)
    .select(
      "template_coordenador, template_lider, template_coordenador_boas_vindas, template_cabo_boas_vindas, secretaria_telefone, grupos_links",
    )
    .eq("client_id", p.client_id)
    .maybeSingle();
  const cfg = (cfgRow ?? {}) as any;

  // 2. Resolve a região efetiva: se não tiver, sobe pelo parent_id (até 3 níveis)
  let regiaoValue: string | null = p.regiao || null;
  if (!regiaoValue && p.parent_id) {
    let currentParentId: string | null = p.parent_id;
    for (let i = 0; i < 3 && currentParentId; i++) {
      const { data: parentRow } = await supabase
        .from("eleicao_pessoas" as any)
        .select("regiao, parent_id")
        .eq("id", currentParentId)
        .maybeSingle();
      const pr = parentRow as any;
      if (!pr) break;
      if (pr.regiao) { regiaoValue = pr.regiao; break; }
      currentParentId = pr.parent_id || null;
    }
  }

  // 3. Label da região
  let regiaoLabel = "—";
  if (regiaoValue) {
    const { data: regRow } = await supabase
      .from("eleicao_regioes" as any)
      .select("label")
      .eq("client_id", p.client_id)
      .eq("value", regiaoValue)
      .maybeSingle();
    regiaoLabel =
      (regRow as any)?.label ||
      REGIAO_LABELS_FALLBACK[regiaoValue] ||
      regiaoValue.charAt(0).toUpperCase() + regiaoValue.slice(1);
  }

  // 4. Link do grupo: interior usa grupo único (__interior__), CG usa por região
  const gruposLinks = (cfg.grupos_links ?? {}) as Record<string, string>;
  let linkGrupo = "";
  if (p.escopo === "interior") {
    linkGrupo = gruposLinks["__interior__"] || "";
  } else if (regiaoValue && typeof gruposLinks === "object" && gruposLinks) {
    linkGrupo = gruposLinks[regiaoValue] || "";
  }

  // 5. Vars de template (mesmas chaves usadas pela edge)
  const vars: Record<string, string> = {
    nome: p.nome,
    regiao: regiaoLabel,
    telefone: fmtPhone(p.telefone || ""),
    rua: p.rua || (p.endereco && p.endereco.trim().toLowerCase() !== (p.bairro || "").trim().toLowerCase() ? p.endereco : "—"),
    numero: p.numero || "s/n",
    bairro: p.bairro || "—",
    link_grupo: linkGrupo || "(grupo não configurado)",
  };

  // 6. Mensagens prontas
  const msgInterno = applyTemplate(cfg.template_coordenador || DEFAULT_TEMPLATE_COORDENADOR, vars);
  const msgLider = applyTemplate(cfg.template_lider || DEFAULT_TEMPLATE_LIDER, vars);
  const msgCoordBV = applyTemplate(cfg.template_coordenador_boas_vindas || DEFAULT_TEMPLATE_COORD_BV, vars);
  const msgCaboBV = applyTemplate(cfg.template_cabo_boas_vindas || DEFAULT_TEMPLATE_CABO_BV, vars);

  // 7. Destinatário "Cadastrado" — varia conforme o tipo
  let cadastrado: FluxoDestino;
  if (!p.telefone) {
    cadastrado = destinoDesabilitado(p.nome, "Pessoa sem telefone cadastrado");
  } else {
    const mensagem =
      p.tipo === "lider" ? msgLider
        : p.tipo === "cabo" ? msgCaboBV
          : msgCoordBV; // coordenador
    cadastrado = {
      disabled: false,
      nome: p.nome,
      telefone: p.telefone,
      telefoneFmt: fmtPhone(p.telefone),
      mensagem,
      waUrl: buildWaUrl(p.telefone, mensagem),
    };
  }

  // 8. Destinatário "Coordenador" — só faz sentido para líder/cabo
  let coordenador: FluxoDestino;
  if (p.tipo === "coordenador") {
    coordenador = destinoDesabilitado(
      "Coordenador acima",
      "Esta pessoa já é coordenadora — não tem coordenador acima.",
    );
  } else {
    let coordPhone: string | null = null;
    let coordNome: string | null = null;

    // 8a. Parent direto (Coordenador ou Líder)
    if (p.parent_id) {
      const { data: parent } = await supabase
        .from("eleicao_pessoas" as any)
        .select("id, nome, telefone, tipo, parent_id")
        .eq("id", p.parent_id)
        .maybeSingle();
      const pr = parent as any;
      
      if (pr?.tipo === "coordenador" && pr.telefone) {
        coordPhone = pr.telefone;
        coordNome = pr.nome;
      } else if (pr?.tipo === "lider" && pr.parent_id) {
        // Se o pai for um líder, tentamos pegar o coordenador desse líder
        const { data: grandParent } = await supabase
          .from("eleicao_pessoas" as any)
          .select("nome, telefone, tipo")
          .eq("id", pr.parent_id)
          .maybeSingle();
        const gpr = grandParent as any;
        if (gpr?.tipo === "coordenador" && gpr.telefone) {
          coordPhone = gpr.telefone;
          coordNome = gpr.nome;
        }
      }
    }

    // 8b. Coordenador favorito da região (Campo Grande)
    if (!coordPhone && regiaoValue && p.escopo === "campo_grande") {
      const { data: fav } = await supabase
        .from("eleicao_pessoas" as any)
        .select("nome, telefone")
        .eq("client_id", p.client_id)
        .eq("tipo", "coordenador")
        .eq("escopo", "campo_grande")
        .eq("regiao", regiaoValue)
        .eq("is_favorito_regiao", true)
        .maybeSingle();
      const fr = fav as any;
      if (fr?.telefone) {
        coordPhone = fr.telefone;
        coordNome = fr.nome;
      } else {
        // 8c. Fallback: coordenador mais antigo da região
        const { data: coord } = await supabase
          .from("eleicao_pessoas" as any)
          .select("nome, telefone")
          .eq("client_id", p.client_id)
          .eq("tipo", "coordenador")
          .eq("escopo", "campo_grande")
          .eq("regiao", regiaoValue)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        const cr = coord as any;
        if (cr?.telefone) {
          coordPhone = cr.telefone;
          coordNome = cr.nome;
        }
      }
    }

    if (!coordPhone) {
      coordenador = destinoDesabilitado(
        "Coordenador",
        regiaoValue
          ? `Sem coordenador definido para a região ${regiaoLabel}`
          : "Sem coordenador definido — confirme a região ou defina um favorito",
      );
    } else {
      coordenador = {
        disabled: false,
        nome: coordNome || "Coordenador",
        telefone: coordPhone,
        telefoneFmt: fmtPhone(coordPhone),
        mensagem: msgInterno,
        waUrl: buildWaUrl(coordPhone, msgInterno),
      };
    }
  }

  // 9. Destinatário "Secretaria"
  let secretaria: FluxoDestino;
  if (!cfg.secretaria_telefone) {
    secretaria = destinoDesabilitado(
      "Secretaria",
      "Telefone da secretaria não configurado em Eleição → Configurações",
    );
  } else {
    secretaria = {
      disabled: false,
      nome: "Secretaria",
      telefone: cfg.secretaria_telefone,
      telefoneFmt: fmtPhone(cfg.secretaria_telefone),
      mensagem: msgInterno,
      waUrl: buildWaUrl(cfg.secretaria_telefone, msgInterno),
    };
  }

  return { coordenador, cadastrado, secretaria };
}
