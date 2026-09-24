import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Folder,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  gerarRelatorioDuplicidadesPdf,
  gerarRelatorioCasosRecusadosPdf,
  gerarRelatorioOcorrenciasLotePdf,
} from "@/lib/eleicao-duplicidades-pdf";
import { useRegioesEleicao } from "@/hooks/useRegioesEleicao";

type DuplicateCase = {
  id: number;
  data_tentativa: string;
  lote_id: string;
  lote_nome: string;
  arquivo_nome: string;
  numero_linha: number;
  nome_tentativa: string | null;
  cpf_tentativa: string | null;
  telefone_tentativa: string | null;
  responsavel_tentativa_nome: string | null;
  responsavel_tentativa_tipo: string | null;
  cadastro_existente_nome: string;
  cadastro_existente_tipo: string;
  cadastro_existente_telefone: string | null;
  cadastro_existente_cpf: string | null;
  fatores_duplicidade: string[];
  responsavel_existente_nome: string | null;
  responsavel_existente_tipo: string | null;
  valor_contratacao: number;
  contrato_inicio: string | null;
  contrato_fim: string | null;
  motivo: string | null;
};

type ImportDuplicateDetail = {
  id: string;
  nome: string;
  tipo: string;
  telefone: string | null;
  cpf: string | null;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  responsavel_tipo: string | null;
  valor_contratacao: number | null;
  is_voluntario: boolean | null;
  contrato_inicio: string | null;
  contrato_fim: string | null;
  importacao_lote_id: string | null;
};

type ImportItem = {
  id: number;
  lote_nome?: string;
  arquivo_nome?: string;
  data_tentativa?: string;
  responsavel_tentativa_id?: string | null;
  responsavel_tentativa_nome?: string | null;
  responsavel_tentativa_tipo?: string | null;
  numero_linha: number;
  nome: string | null;
  cpf_normalizado: string | null;
  telefone_normalizado: string | null;
  classificacao: string;
  motivo: string | null;
  valor_aplicado: number;
  pessoa_existente_id: string | null;
  duplicado: ImportDuplicateDetail | null;
  repetido_no_arquivo?: {
    id: number;
    numero_linha: number;
    nome: string | null;
    cpf_normalizado: string | null;
    telefone_normalizado: string | null;
  } | null;
};

type ImportLot = {
  id: string;
  nome: string;
  arquivo_nome: string;
  parent_id_padrao: string | null;
  valor_unitario: number;
  status: string;
  total_linhas: number;
  total_elegiveis: number;
  total_duplicados: number;
  total_repetidos_arquivo: number;
  total_invalidos: number;
  custo_bruto: number;
  custo_previsto: number;
  custo_confirmado: number;
  created_at: string;
};

type Analysis = { lote: ImportLot; itens: ImportItem[] };
type ManagedContract = {
  item_id: number; numero_linha: number; classificacao: string; motivo: string | null;
  nome_importado: string | null; cpf_importado: string | null; telefone_importado: string | null;
  pessoa_id: string | null; nome: string | null; cpf: string | null; telefone: string | null;
  valor: number | null; contrato_inicio: string | null; contrato_fim: string | null;
  responsavel_id: string | null; responsavel_nome: string | null; arquivado_em: string | null;
  pertence_ao_lote: boolean; lote_contrato_nome: string | null;
  conflito_pessoa_id?: string | null; conflito_nome?: string | null;
  conflito_telefone?: string | null; conflito_cpf?: string | null;
  conflito_responsavel?: string | null;
};
type ContractEdit = ManagedContract & { valorTexto: string; ativo: boolean };
type LotValueEdit = { id: string; valor: string; parentId: string; motivo: string };
type DuplicateCorrection = {
  id: number;
  nome: string;
  cpf: string;
  telefone: string;
  motivo: string;
};
type DuplicatePerson = {
  id: string;
  nome: string;
  tipo: string;
  telefone: string | null;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  responsavel_tipo: string | null;
  valor_contratacao: number | null;
  is_voluntario: boolean | null;
  contrato_inicio: string | null;
  contrato_fim: string | null;
  importacao_lote_id: string | null;
  importacao_lote_nome: string | null;
  contrato_ativo: boolean;
};
type DuplicateGroup = {
  tipo: "telefone" | "cpf";
  chave: string;
  cadastros: DuplicatePerson[];
};
type DuplicateFolder = {
  key: string;
  name: string;
  role: string;
  groups: DuplicateGroup[];
};
type Parent = {
  id: string;
  nome: string;
  tipo: string;
  escopo: "campo_grande" | "interior";
  regiao: string | null;
  cidade: string | null;
};
type SheetRow = Record<string, unknown>;
type QuickParentForm = {
  tipo: "coordenador" | "lider";
  nome: string;
  telefone: string;
  valor: string;
  escopo: "campo_grande" | "interior";
  regiao: string;
  cidade: string;
  coordenadorId: string;
};

// As tabelas/RPCs passam a integrar os tipos gerados depois que a migration for aplicada.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error
    ? error.message
    : typeof error === "object" && error !== null && "message" in error
      ? String(error.message)
      : fallback;
const money = (value: number) =>
  Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const norm = (value: unknown) => String(value ?? "").trim();
const key = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const roleLabel = (role: string | null) =>
  role === "coordenador" ? "Coordenador" : role === "lider" ? "Líder" : "Sem responsável";
const duplicateOwnerKey = (person: DuplicatePerson) => person.responsavel_id || "sem-responsavel";
const duplicateOwnerLabel = (person: DuplicatePerson) =>
  person.responsavel_nome
    ? `${person.responsavel_nome} (${roleLabel(person.responsavel_tipo).toLowerCase()})`
    : "sem responsável";

const aliases: Record<string, string[]> = {
  nome: ["nome", "nomecompleto", "nomedocabo", "cabo", "caboseleitorais"],
  cpf: ["cpf", "cpfdocabo", "documento"],
  telefone: [
    "telefone",
    "telefonecelular",
    "numerodetelefone",
    "celular",
    "celularwhatsapp",
    "whatsapp",
    "fone",
  ],
  endereco: [
    "endereco",
    "enderecocompleto",
    "enderecoresidencial",
    "logradouro",
    "rua",
    "avenida",
    "residencia",
  ],
  numero: ["numero", "numerodacasa", "nro", "num"],
  complemento: ["complemento", "complementoendereco"],
  bairro: ["bairro"],
  cidade: ["cidade", "municipio"],
  regiao: ["regiao", "regional"],
};

function normalizeRows(rows: SheetRow[]) {
  return rows
    .map((row) => {
      const indexed = Object.fromEntries(
        Object.entries(row).map(([header, value]) => [key(header), value]),
      );
      const get = (field: string) =>
        aliases[field].map((alias) => indexed[alias]).find((value) => value !== undefined);
      const endereco = norm(get("endereco"));
      const numero = norm(get("numero"));
      const complemento = norm(get("complemento"));
      return {
        nome: norm(get("nome")),
        cpf: digits(get("cpf")),
        telefone: digits(get("telefone")),
        endereco: [endereco, numero, complemento].filter(Boolean).join(", "),
        bairro: norm(get("bairro")),
        cidade: norm(get("cidade")),
        regiao: key(norm(get("regiao"))).replace("regiao", ""),
      };
    })
    .filter((row) => Object.values(row).some(Boolean));
}

const classificationLabel: Record<string, string> = {
  elegivel: "Elegível",
  cadastro_sem_contrato: "Cadastro reaproveitado",
  confirmado: "Confirmado",
  duplicado_contrato_ativo: "Contrato ativo",
  duplicado_no_arquivo: "Repetido na planilha",
  conflito_identidade: "Conflito de identidade",
  dados_invalidos: "Dados inválidos",
};

export default function EleicaoCabosImportacaoPanel({
  clientId,
  onChanged,
}: {
  clientId: string;
  onChanged: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { regioes } = useRegioesEleicao(clientId);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [parents, setParents] = useState<Parent[]>([]);
  const [history, setHistory] = useState<ImportLot[]>([]);
  const [databaseDuplicates, setDatabaseDuplicates] = useState<DuplicateGroup[]>([]);
  const [duplicateCases, setDuplicateCases] = useState<DuplicateCase[]>([]);
  const [selectedCaseIds, setSelectedCaseIds] = useState<Set<number>>(new Set());
  const [duplicateCorrection, setDuplicateCorrection] = useState<DuplicateCorrection | null>(null);
  const [auditItems, setAuditItems] = useState<ImportItem[]>([]);
  const [auditLot, setAuditLot] = useState<string | null>(null);
  const [managedLot, setManagedLot] = useState<string | null>(null);
  const [managedContracts, setManagedContracts] = useState<ManagedContract[]>([]);
  const [contractEdit, setContractEdit] = useState<ContractEdit | null>(null);
  const [expandedOccurrence, setExpandedOccurrence] = useState<number | null>(null);
  const [exceptionReason, setExceptionReason] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [lotValueEdit, setLotValueEdit] = useState<LotValueEdit | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [start, setStart] = useState(format(new Date(), "yyyy-MM-dd"));
  const [end, setEnd] = useState("");
  const [parentId, setParentId] = useState("");
  const [quickParentOpen, setQuickParentOpen] = useState(false);
  const [quickParent, setQuickParent] = useState<QuickParentForm>({
    tipo: "lider", nome: "", telefone: "", valor: "", escopo: "campo_grande",
    regiao: "", cidade: "", coordenadorId: "",
  });

  const loadBase = async () => {
    await db.rpc("eleicao_cabo_import_limpar_rascunhos", { p_client_id: clientId });
    const [parentResult, lotsResult, duplicatesResult, casesResult] = await Promise.all([
      db
        .from("eleicao_pessoas")
        .select("id,nome,tipo,escopo,regiao,cidade")
        .eq("client_id", clientId)
        .is("arquivado_em", null)
        .in("tipo", ["coordenador", "lider"])
        .order("nome"),
      db
        .from("eleicao_cabo_import_lotes")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(100),
      db.rpc("eleicao_auditar_duplicidades", { p_client_id: clientId }),
      db.rpc("eleicao_casos_duplicados_ativos", { p_client_id: clientId }),
    ]);
    if (!parentResult.error) setParents(parentResult.data || []);
    if (!lotsResult.error) setHistory(lotsResult.data || []);
    if (!duplicatesResult.error)
      setDatabaseDuplicates(Array.isArray(duplicatesResult.data) ? duplicatesResult.data : []);
    if (!casesResult.error)
      setDuplicateCases(Array.isArray(casesResult.data) ? casesResult.data : []);
  };

  useEffect(() => {
    void loadBase();
    // loadBase depende apenas do clientId recebido pelo painel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const totals = analysis?.lote;
  const selectedParent = useMemo(
    () => parents.find((parent) => parent.id === parentId) || null,
    [parentId, parents],
  );
  const exceptions = useMemo(
    () =>
      analysis?.itens.filter(
        (item) => !["elegivel", "cadastro_sem_contrato", "confirmado"].includes(item.classificacao),
      ) || [],
    [analysis],
  );
  const activeContractDuplicates = useMemo(
    () =>
      databaseDuplicates
        .map((group) => ({
          ...group,
          cadastros: group.cadastros.filter((person) => person.contrato_ativo),
        }))
        .filter((group) => group.cadastros.length > 1),
    [databaseDuplicates],
  );
  const contractsAtRisk = useMemo(() => {
    const people = new Map<string, DuplicatePerson>();
    for (const group of activeContractDuplicates) {
      for (const person of group.cadastros) people.set(person.id, person);
    }
    return Array.from(people.values());
  }, [activeContractDuplicates]);
  const riskValue = useMemo(
    () =>
      contractsAtRisk.reduce((total, person) => total + Number(person.valor_contratacao || 0), 0),
    [contractsAtRisk],
  );
  const activeHistory = useMemo(
    () => history.filter((lot) => lot.status === "confirmado"),
    [history],
  );
  const coordenadores = useMemo(
    () => parents.filter((parent) => parent.tipo === "coordenador"),
    [parents],
  );

  const openQuickParent = () => {
    const base = selectedParent;
    setQuickParent({
      tipo: "lider",
      nome: "",
      telefone: "",
      valor: value,
      escopo: base?.escopo || "campo_grande",
      regiao: base?.regiao || regioes[0]?.value || "",
      cidade: base?.cidade || "",
      coordenadorId: base?.tipo === "coordenador" ? base.id : "",
    });
    setQuickParentOpen(true);
  };

  const saveQuickParent = async () => {
    const nome = quickParent.nome.trim();
    const telefone = digits(quickParent.telefone);
    const valorContratacao = Number(quickParent.valor.replace(/\./g, "").replace(",", "."));
    const coordenador = quickParent.tipo === "lider"
      ? coordenadores.find((item) => item.id === quickParent.coordenadorId) || null
      : null;
    const escopo = coordenador?.escopo || quickParent.escopo;
    const regiao = coordenador?.regiao || (escopo === "campo_grande" ? quickParent.regiao : null);
    const cidade = coordenador?.cidade || (escopo === "interior" ? quickParent.cidade.trim() : "Campo Grande");

    if (!nome || telefone.length < 10) return toast.error("Informe nome e telefone válido.");
    if (!Number.isFinite(valorContratacao) || valorContratacao <= 0)
      return toast.error("Informe um valor de contratação maior que zero.");
    if (escopo === "campo_grande" && !regiao) return toast.error("Selecione a região.");
    if (escopo === "interior" && !cidade) return toast.error("Informe a cidade.");

    setBusy(true);
    try {
      const { data, error } = await db.from("eleicao_pessoas").insert({
        client_id: clientId,
        tipo: quickParent.tipo,
        escopo,
        regiao: escopo === "campo_grande" ? regiao : null,
        cidade,
        nome,
        telefone,
        endereco: "Não informado",
        parent_id: quickParent.tipo === "lider" ? coordenador?.id || null : null,
        valor_contratacao: valorContratacao,
        is_voluntario: false,
        status_contratacao: "confirmado",
        confirmado_em: new Date().toISOString(),
        vigencia_inicio: start || null,
        vigencia_fim: end || null,
        contrato_inicio: start || null,
        contrato_fim: end || null,
      }).select("id,nome,tipo,escopo,regiao,cidade").single();
      if (error) throw error;
      const novo = data as Parent;
      setParents((current) => [...current, novo].sort((a, b) => a.nome.localeCompare(b.nome)));
      setParentId(novo.id);
      setQuickParentOpen(false);
      onChanged();
      toast.success(`${roleLabel(novo.tipo)} cadastrado e selecionado como responsável.`);
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Não foi possível cadastrar o responsável."));
    } finally {
      setBusy(false);
    }
  };
  const canceledHistory = useMemo(
    () => history.filter((lot) => lot.status === "cancelado"),
    [history],
  );
  const selectedCases = useMemo(
    () => duplicateCases.filter((item) => selectedCaseIds.has(item.id)),
    [duplicateCases, selectedCaseIds],
  );
  const toggleCase = (id: number) =>
    setSelectedCaseIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const startDuplicateCorrection = (item: DuplicateCase) =>
    setDuplicateCorrection({
      id: item.id,
      nome: item.nome_tentativa || "",
      cpf: item.cpf_tentativa || "",
      telefone: item.telefone_tentativa || "",
      motivo: "Correção de dados informados na planilha",
    });

  const saveDuplicateCorrection = async () => {
    if (!duplicateCorrection) return;
    if (
      !window.confirm(
        "Confirmar a correção e tentar contratar este cabo? CPF e telefone serão verificados novamente em toda a base.",
      )
    )
      return;
    setBusy(true);
    try {
      const { data, error } = await db.rpc("eleicao_caso_duplicado_corrigir_contratar", {
        p_item_id: duplicateCorrection.id,
        p_nome: duplicateCorrection.nome,
        p_cpf: duplicateCorrection.cpf || null,
        p_telefone: duplicateCorrection.telefone,
        p_motivo: duplicateCorrection.motivo,
      });
      if (error) throw error;
      setDuplicateCorrection(null);
      setSelectedCaseIds((current) => {
        const next = new Set(current);
        next.delete(Number(data?.item_id));
        return next;
      });
      await loadBase();
      onChanged();
      toast.success(`Cabo contratado após a correção — ${money(data?.valor || 0)}.`);
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Não foi possível contratar com os dados corrigidos."));
    } finally {
      setBusy(false);
    }
  };

  const archiveDuplicateCases = async (ids: number[]) => {
    if (!ids.length || busy) return;
    const quantidade = ids.length;
    if (!window.confirm(
      quantidade === 1
        ? "Arquivar este caso já conferido? Ele sairá da Central, mas continuará registrado no histórico da importação."
        : `Arquivar os ${quantidade} casos selecionados? Eles sairão da Central, mas continuarão registrados no histórico das importações.`,
    )) return;

    setBusy(true);
    try {
      const { data, error } = await db.rpc("eleicao_casos_duplicados_arquivar", {
        p_client_id: clientId,
        p_item_ids: ids,
        p_motivo: "Duplicidade conferida manualmente",
      });
      if (error) throw error;
      const arquivados = Number(data?.arquivados || 0);
      setSelectedCaseIds((current) => {
        const next = new Set(current);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      if (duplicateCorrection && ids.includes(duplicateCorrection.id)) {
        setDuplicateCorrection(null);
      }
      await loadBase();
      toast.success(
        arquivados === 1
          ? "Caso arquivado e retirado da Central."
          : `${arquivados} casos arquivados e retirados da Central.`,
      );
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Não foi possível arquivar os casos selecionados."));
    } finally {
      setBusy(false);
    }
  };
  const duplicateFolders = useMemo(() => {
    const folders = new Map<string, DuplicateFolder>();
    for (const group of activeContractDuplicates) {
      const owners = new Map<string, { name: string; role: string }>();
      for (const person of group.cadastros) {
        const ownerId = duplicateOwnerKey(person);
        owners.set(ownerId, {
          name: person.responsavel_nome || "Sem responsável",
          role: person.responsavel_tipo || "",
        });
      }
      for (const [ownerId, owner] of owners) {
        const folder = folders.get(ownerId) || {
          key: ownerId,
          name: owner.name,
          role: owner.role,
          groups: [],
        };
        folder.groups.push(group);
        folders.set(ownerId, folder);
      }
    }
    return Array.from(folders.values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [activeContractDuplicates]);

  const readFile = async (selected: File) => {
    setBusy(true);
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await selected.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const parsed = normalizeRows(
        XLSX.utils.sheet_to_json<SheetRow>(sheet, { defval: "", raw: false }),
      );
      if (!parsed.length)
        throw new Error("A planilha está vazia ou não possui cabeçalhos reconhecidos.");
      if (parsed.length > 10000) throw new Error("Cada importação aceita no máximo 10.000 linhas.");
      setFile(selected);
      setRows(parsed);
      setName(selected.name.replace(/\.[^.]+$/, ""));
      setAnalysis(null);
      toast.success(`${parsed.length} linhas lidas da planilha.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível ler a planilha.");
    } finally {
      setBusy(false);
    }
  };

  const analyzeParams = () => ({
    p_client_id: clientId,
    p_nome: name,
    p_arquivo_nome: file?.name || "planilha.xlsx",
    p_valor_unitario: Number(value.replace(/\./g, "").replace(",", ".")),
    p_data_inicio: start,
    p_data_fim: end || null,
    p_parent_id: selectedParent?.id || null,
    p_escopo: selectedParent?.escopo || null,
    p_regiao: selectedParent?.escopo === "campo_grande" ? selectedParent.regiao : null,
    p_cidade: selectedParent?.escopo === "interior" ? selectedParent.cidade : null,
    p_linhas: rows,
  });

  const analyze = async () => {
    const unitValue = Number(value.replace(/\./g, "").replace(",", "."));
    if (!file || !rows.length) return toast.error("Selecione uma planilha.");
    if (!unitValue || unitValue <= 0)
      return toast.error("Informe um valor por cabo maior que zero.");
    if (!selectedParent) return toast.error("Selecione o líder ou coordenador responsável.");
    if (selectedParent.escopo === "campo_grande" && !selectedParent.regiao)
      return toast.error("O responsável selecionado não possui região cadastrada.");
    if (selectedParent.escopo === "interior" && !selectedParent.cidade)
      return toast.error("O responsável selecionado não possui cidade cadastrada.");
    setBusy(true);
    try {
      const { data, error } = await db.rpc("eleicao_cabo_import_analisar", analyzeParams());
      if (error) throw error;
      const preview = data as Analysis;
      const { error: discardError } = await db.rpc("eleicao_cabo_import_descartar", {
        p_lote_id: preview.lote.id,
      });
      if (discardError) throw discardError;
      setAnalysis(preview);
      toast.success("Prévia concluída. Nada foi salvo; confirme para realizar a importação.");
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Falha ao analisar a planilha."));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!analysis) return;
    setBusy(true);
    let pendingLotId: string | null = null;
    try {
      const { data: analyzedData, error: analyzeError } = await db.rpc(
        "eleicao_cabo_import_analisar",
        analyzeParams(),
      );
      if (analyzeError) throw analyzeError;
      pendingLotId = (analyzedData as Analysis).lote.id;

      const { data, error } = await db.rpc("eleicao_cabo_import_confirmar", {
        p_lote_id: pendingLotId,
      });
      if (error) throw error;
      pendingLotId = null;
      toast.success(`${data.confirmados} cabos confirmados — ${money(data.custo_confirmado)}.`);
      setAnalysis(null);
      setFile(null);
      setRows([]);
      setName("");
      setValue("");
      setParentId("");
      await loadBase();
      onChanged();
    } catch (error: unknown) {
      if (pendingLotId) {
        await db.rpc("eleicao_cabo_import_descartar", { p_lote_id: pendingLotId });
      }
      toast.error(errorMessage(error, "Falha ao confirmar a importação."));
    } finally {
      setBusy(false);
    }
  };

  const saveLotValue = async () => {
    if (!lotValueEdit) return;
    const newValue = Number(lotValueEdit.valor.replace(/\./g, "").replace(",", "."));
    if (!newValue || newValue <= 0) return toast.error("Informe um valor maior que zero.");
    if (!lotValueEdit.parentId) return toast.error("Selecione o líder ou coordenador responsável.");
    if (!lotValueEdit.motivo.trim()) return toast.error("Informe o motivo da alteração.");
    if (
      !window.confirm(
        "Confirmar a alteração do lote? Se o responsável mudou, os cabos confirmados serão transferidos para ele e herdarão sua localização.",
      )
    )
      return;

    setBusy(true);
    try {
      const { data, error } = await db.rpc("eleicao_cabo_import_editar", {
        p_lote_id: lotValueEdit.id,
        p_valor_unitario: newValue,
        p_parent_id: lotValueEdit.parentId,
        p_motivo: lotValueEdit.motivo.trim(),
      });
      if (error) throw error;
      setLotValueEdit(null);
      await loadBase();
      onChanged();
      const actions = [
        data?.valor_alterado ? `${data?.contratos_atualizados || 0} valor(es) atualizado(s)` : null,
        data?.responsavel_alterado ? `${data?.cabos_movidos || 0} cabo(s) transferido(s)` : null,
      ].filter(Boolean);
      toast.success(`${actions.join(" e ")} — custo ${money(data?.custo_novo || 0)}.`);
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Não foi possível alterar o lote."));
    } finally {
      setBusy(false);
    }
  };

  const loadAudit = async (lotId: string) => {
    setBusy(true);
    try {
      const { data, error } = await db.rpc("eleicao_cabo_import_ocorrencias", {
        p_lote_id: lotId,
      });
      if (error) throw error;
      setAuditItems(Array.isArray(data) ? (data as ImportItem[]) : []);
      setAuditLot(lotId);
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Falha ao abrir a auditoria."));
    } finally {
      setBusy(false);
    }
  };

  const loadManagedContracts = async (lotId: string) => {
    setBusy(true);
    try {
      const { data, error } = await db.rpc("eleicao_cabo_import_contratos", { p_lote_id: lotId });
      if (error) throw error;
      setManagedContracts(Array.isArray(data) ? data : []);
      setManagedLot(lotId);
      setContractEdit(null);
      setExpandedOccurrence(null);
      setExceptionReason("");
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Não foi possível carregar os contratos do lote."));
    } finally { setBusy(false); }
  };

  const saveManagedContract = async () => {
    if (!managedLot || !contractEdit || !contractEdit.pessoa_id) return;
    const valorContrato = Number(contractEdit.valorTexto.replace(/\./g, "").replace(",", "."));
    setBusy(true);
    try {
      const { error } = await db.rpc("eleicao_cabo_import_editar_contrato", {
        p_lote_id: managedLot, p_item_id: contractEdit.item_id,
        p_nome: contractEdit.nome, p_cpf: contractEdit.cpf || null,
        p_telefone: contractEdit.telefone, p_valor: valorContrato,
        p_parent_id: contractEdit.responsavel_id,
        p_inicio: contractEdit.contrato_inicio, p_fim: contractEdit.contrato_fim || null,
        p_ativo: contractEdit.ativo,
      });
      if (error) throw error;
      await Promise.all([loadManagedContracts(managedLot), loadBase()]);
      onChanged();
      toast.success(contractEdit.ativo ? "Contrato salvo e ativo." : "Contrato arquivado.");
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Não foi possível salvar o contrato."));
    } finally { setBusy(false); }
  };

  const archiveManagedLot = async () => {
    if (!managedLot || !window.confirm("Excluir todos os contratos deste lote? Eles serão arquivados e poderão ser reativados individualmente. As linhas da importação continuarão no histórico.")) return;
    setBusy(true);
    try {
      const { data, error } = await db.rpc("eleicao_cabo_import_arquivar_todos", { p_lote_id: managedLot });
      if (error) throw error;
      await Promise.all([loadManagedContracts(managedLot), loadBase()]);
      onChanged();
      toast.success(`${Number(data?.arquivados || 0)} contrato(s) arquivado(s).`);
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Não foi possível excluir os contratos do lote."));
    } finally { setBusy(false); }
  };

  const approveSharedPhone = async (item: ManagedContract) => {
    if (!managedLot || !exceptionReason.trim()) return toast.error("Informe por que o telefone pode ser compartilhado.");
    if (!window.confirm(`Validar o contrato de ${item.nome_importado || item.nome} mesmo usando o telefone de ${item.conflito_nome || "outra pessoa"}? Esta exceção ficará registrada.`)) return;
    setBusy(true);
    try {
      const { error } = await db.rpc("eleicao_cabo_import_aprovar_telefone_compartilhado", {
        p_lote_id: managedLot, p_item_id: item.item_id, p_motivo: exceptionReason.trim(),
      });
      if (error) throw error;
      setExpandedOccurrence(null); setExceptionReason("");
      await Promise.all([loadManagedContracts(managedLot), loadBase()]);
      onChanged(); toast.success("Contrato validado com telefone compartilhado.");
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Não foi possível validar a exceção."));
    } finally { setBusy(false); }
  };

  const resolveActiveDuplicate = async (group: DuplicateGroup, keep: DuplicatePerson) => {
    const archive = group.cadastros.filter((person) => person.id !== keep.id);
    if (
      !window.confirm(
        `Manter o contrato de ${keep.nome}, vinculado a ${duplicateOwnerLabel(keep)}, e arquivar ${archive.length} cadastro(s) duplicado(s)? A correção fica registrada e é reversível.`,
      )
    )
      return;
    setBusy(true);
    try {
      const { data, error } = await db.rpc("eleicao_resolver_contratos_duplicados", {
        p_client_id: clientId,
        p_manter_id: keep.id,
        p_arquivar_ids: archive.map((person) => person.id),
      });
      if (error) throw error;
      await loadBase();
      onChanged();
      toast.success(
        `${Number(data?.arquivados || archive.length)} contrato(s) duplicado(s) arquivado(s).`,
      );
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Falha ao corrigir os contratos duplicados."));
    } finally {
      setBusy(false);
    }
  };

  const exportExceptions = async () => {
    if (!exceptions.length) return;
    const XLSX = await import("xlsx");
    const worksheet = XLSX.utils.json_to_sheet(
      exceptions.map((item) => ({
        linha: item.numero_linha,
        nome: item.nome,
        cpf: item.cpf_normalizado,
        telefone: item.telefone_normalizado,
        situacao: classificationLabel[item.classificacao],
        motivo: item.motivo,
      })),
    );
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Duplicados e inválidos");
    XLSX.writeFile(workbook, `auditoria-${analysis?.lote.nome || "cabos"}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Importar cabos eleitorais</CardTitle>
          <CardDescription>
            Envie Excel ou CSV, defina o valor e confira duplicados antes de alterar a previsão de
            custos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1">
              <Label>Nome da importação</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Cabos Região Lagoa"
              />
            </div>
            <div className="space-y-1">
              <Label>Valor por cabo</Label>
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                inputMode="decimal"
                placeholder="500,00"
              />
            </div>
            <div className="space-y-1">
              <Label>Início</Label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Término (opcional)</Label>
              <Input type="date" min={start} value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Responsável padrão</Label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um líder ou coordenador" />
                </SelectTrigger>
                <SelectContent>
                  {parents.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome} · {p.tipo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="link" className="h-auto px-0 py-1" onClick={openQuickParent}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Cadastrar líder ou coordenador
              </Button>
            </div>
            <div className="space-y-1">
              <Label>Local herdado do responsável</Label>
              <div className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm">
                {selectedParent
                  ? selectedParent.escopo === "interior"
                    ? selectedParent.cidade || "Cidade não cadastrada"
                    : `Campo Grande · ${selectedParent.regiao || "região não cadastrada"}`
                  : "Selecione o responsável"}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Planilha</Label>
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => e.target.files?.[0] && void readFile(e.target.files[0])}
              />
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                onClick={() => inputRef.current?.click()}
                disabled={busy}
              >
                <Upload className="mr-2 h-4 w-4" />
                {file ? file.name : "Selecionar Excel ou CSV"}
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>
              Obrigatórios: nome e telefone/celular/WhatsApp. Opcionais: CPF, endereço/rua, número,
              complemento e bairro. Escopo, região ou cidade serão herdados automaticamente do
              responsável.
            </span>
            <Button onClick={analyze} disabled={busy || !rows.length}>
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="mr-2 h-4 w-4" />
              )}
              Analisar {rows.length || ""} registros
            </Button>
          </div>
        </CardContent>
      </Card>

      {totals && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle>Prévia da importação</CardTitle>
            <CardDescription>Nenhum cadastro ou valor foi confirmado ainda.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
              {[
                ["Linhas", totals.total_linhas],
                ["Elegíveis", totals.total_elegiveis],
                ["Duplicados", totals.total_duplicados],
                ["Inválidos", totals.total_invalidos],
              ].map(([label, n]) => (
                <div key={String(label)} className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-2xl font-bold">{n}</p>
                </div>
              ))}
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Custo bruto</p>
                <p className="font-bold">{money(totals.custo_bruto)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Excluído</p>
                <p className="font-bold text-destructive">
                  {money(totals.custo_bruto - totals.custo_previsto)}
                </p>
              </div>
              <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 dark:bg-emerald-950/20">
                <p className="text-xs text-muted-foreground">Previsão final</p>
                <p className="font-bold text-emerald-700">{money(totals.custo_previsto)}</p>
              </div>
            </div>
            <Tabs defaultValue="aptos">
              <TabsList>
                <TabsTrigger value="aptos">Aptos ({totals.total_elegiveis})</TabsTrigger>
                <TabsTrigger value="exceptions">
                  Duplicados e inválidos ({exceptions.length})
                </TabsTrigger>
              </TabsList>
              <TabsContent value="aptos">
                <ItemTable
                  items={analysis!.itens.filter((i) =>
                    ["elegivel", "cadastro_sem_contrato"].includes(i.classificacao),
                  )}
                />
              </TabsContent>
              <TabsContent value="exceptions">
                <div className="mb-2 flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={exportExceptions}
                    disabled={!exceptions.length}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Exportar auditoria
                  </Button>
                </div>
                <ItemTable items={exceptions} />
              </TabsContent>
            </Tabs>
            <div className="flex justify-end">
              <Button
                onClick={confirm}
                disabled={
                  busy ||
                  (!totals.total_elegiveis &&
                    !analysis.itens.some(
                      (item) => item.classificacao === "duplicado_contrato_ativo",
                    ))
                }
              >
                {busy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                {totals.total_elegiveis
                  ? `Confirmar ${totals.total_elegiveis} contratações — ${money(totals.custo_previsto)}`
                  : "Finalizar auditoria sem contratações"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-amber-300">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Central de duplicados recusados</CardTitle>
              <CardDescription>
                Somente tentativas recusadas porque o cabo já possuía contrato ativo.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!duplicateCases.length}
                onClick={() =>
                  setSelectedCaseIds(
                    selectedCaseIds.size === duplicateCases.length
                      ? new Set()
                      : new Set(duplicateCases.map((item) => item.id)),
                  )
                }
              >
                {selectedCaseIds.size === duplicateCases.length
                  ? "Limpar seleção"
                  : "Selecionar todos"}
              </Button>
              <Button
                size="sm"
                disabled={!selectedCases.length}
                onClick={() => void gerarRelatorioCasosRecusadosPdf(selectedCases)}
              >
                <Download className="mr-2 h-4 w-4" />
                Gerar relatório ({selectedCases.length})
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!selectedCases.length || busy}
                onClick={() => void archiveDuplicateCases(selectedCases.map((item) => item.id))}
              >
                {busy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Archive className="mr-2 h-4 w-4" />
                )}
                Arquivar selecionados ({selectedCases.length})
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!duplicateCases.length ? (
            <div className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              Nenhuma tentativa recusada por contrato ativo.
            </div>
          ) : (
            <div className="space-y-2">
              {duplicateCases.map((item) => (
                <div key={item.id} className="flex items-start gap-3 rounded-lg border p-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={selectedCaseIds.has(item.id)}
                    onChange={() => toggleCase(item.id)}
                    aria-label={`Selecionar caso de ${item.nome_tentativa || "cabo"}`}
                  />
                  <details className="min-w-0 flex-1">
                    <summary className="cursor-pointer list-none">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold">{item.nome_tentativa || "Sem nome"}</p>
                          <p className="text-xs text-muted-foreground">
                            Tentativa para {item.responsavel_tentativa_nome || "sem responsável"} •{" "}
                            {format(new Date(item.data_tentativa), "dd/MM/yyyy HH:mm")}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">
                            Coincidência por{" "}
                            {item.fatores_duplicidade?.length
                              ? item.fatores_duplicidade
                                  .map((fator) =>
                                    fator === "cpf"
                                      ? "CPF"
                                      : fator === "nome_telefone"
                                        ? "nome + telefone"
                                        : "telefone",
                                  )
                                  .join(" e ")
                              : "nome + telefone, telefone ou CPF"}
                          </Badge>
                          <Badge variant="destructive">Contrato ativo encontrado</Badge>
                        </div>
                      </div>
                    </summary>
                    <div className="mt-3 grid gap-3 border-t pt-3 md:grid-cols-2">
                      <div className="rounded-md bg-muted/40 p-3 text-sm">
                        <p className="font-medium">Tentativa recusada</p>
                        <p>Líder/coordenador: {item.responsavel_tentativa_nome || "—"}</p>
                        <p>Telefone informado: {item.telefone_tentativa || "—"}</p>
                        <p>CPF informado: {item.cpf_tentativa || "—"}</p>
                        <p>Arquivo: {item.arquivo_nome}</p>
                        <p>Linha: {item.numero_linha + 1}</p>
                      </div>
                      <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm">
                        <p className="font-medium">Onde já está contratado</p>
                        <p>{item.cadastro_existente_nome}</p>
                        <p>Telefone: {item.cadastro_existente_telefone || "—"}</p>
                        <p>CPF: {item.cadastro_existente_cpf || "—"}</p>
                        <p>
                          Responsável: {item.responsavel_existente_nome || "sem responsável"}
                          {item.responsavel_existente_tipo
                            ? ` (${roleLabel(item.responsavel_existente_tipo).toLowerCase()})`
                            : ""}
                        </p>
                        <p>Contrato: {money(item.valor_contratacao)}</p>
                        <p>
                          Período:{" "}
                          {item.contrato_inicio
                            ? format(new Date(`${item.contrato_inicio}T12:00:00`), "dd/MM/yyyy")
                            : "não informado"}
                          {" até "}
                          {item.contrato_fim
                            ? format(new Date(`${item.contrato_fim}T12:00:00`), "dd/MM/yyyy")
                            : "sem término"}
                        </p>
                      </div>
                    </div>
                    {duplicateCorrection?.id === item.id ? (
                      <div className="mt-3 rounded-md border border-amber-300 bg-amber-50/50 p-3">
                        <div className="mb-3">
                          <p className="font-medium">Corrigir dados e revalidar contratação</p>
                          <p className="text-xs text-muted-foreground">
                            A contratação continuará bloqueada se o CPF ou telefone corrigido ainda
                            pertencer a qualquer cadastro ativo.
                          </p>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                          <div className="space-y-1">
                            <Label>Nome</Label>
                            <Input
                              value={duplicateCorrection.nome}
                              onChange={(event) =>
                                setDuplicateCorrection({
                                  ...duplicateCorrection,
                                  nome: event.target.value,
                                })
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label>CPF</Label>
                            <Input
                              value={duplicateCorrection.cpf}
                              onChange={(event) =>
                                setDuplicateCorrection({
                                  ...duplicateCorrection,
                                  cpf: event.target.value,
                                })
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label>Telefone com DDD</Label>
                            <Input
                              value={duplicateCorrection.telefone}
                              onChange={(event) =>
                                setDuplicateCorrection({
                                  ...duplicateCorrection,
                                  telefone: event.target.value,
                                })
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label>Motivo da correção</Label>
                            <Input
                              value={duplicateCorrection.motivo}
                              onChange={(event) =>
                                setDuplicateCorrection({
                                  ...duplicateCorrection,
                                  motivo: event.target.value,
                                })
                              }
                            />
                          </div>
                        </div>
                        <div className="mt-3 flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => setDuplicateCorrection(null)}
                          >
                            <X className="mr-2 h-4 w-4" />
                            Cancelar
                          </Button>
                          <Button
                            size="sm"
                            disabled={
                              busy ||
                              !duplicateCorrection.nome.trim() ||
                              !duplicateCorrection.telefone.trim() ||
                              !duplicateCorrection.motivo.trim()
                            }
                            onClick={() => void saveDuplicateCorrection()}
                          >
                            {busy ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Save className="mr-2 h-4 w-4" />
                            )}
                            Revalidar e contratar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 flex flex-wrap justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => void archiveDuplicateCases([item.id])}
                        >
                          <Archive className="mr-2 h-4 w-4" />
                          Arquivar caso
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => startDuplicateCorrection(item)}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          Corrigir dados e tentar contratar
                        </Button>
                      </div>
                    )}
                  </details>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card
        className={activeContractDuplicates.length ? "border-destructive/60" : "border-emerald-300"}
      >
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Auditoria financeira — contratos ativos duplicados</CardTitle>
            <div className="flex items-center gap-2">
              {!!activeContractDuplicates.length && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void gerarRelatorioDuplicidadesPdf(activeContractDuplicates)}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Baixar relatório completo
                </Button>
              )}
              <Badge variant={activeContractDuplicates.length ? "destructive" : "outline"}>
                {activeContractDuplicates.length} conflito(s) financeiro(s)
              </Badge>
            </div>
          </div>
          <CardDescription>
            Varredura de ponta a ponta. Nome + telefone é a identificação principal; telefone e CPF
            também são conferidos separadamente para impedir contratos ativos simultâneos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!activeContractDuplicates.length ? (
            <div className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              Nenhum contrato ativo duplicado encontrado. Existem {databaseDuplicates.length}{" "}
              conflito(s) cadastral(is) sem risco de pagamento duplo.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border bg-destructive/5 p-3">
                  <p className="text-xs text-muted-foreground">Conflitos financeiros</p>
                  <p className="text-xl font-bold text-destructive">
                    {activeContractDuplicates.length}
                  </p>
                </div>
                <div className="rounded-lg border bg-destructive/5 p-3">
                  <p className="text-xs text-muted-foreground">Contratos sob revisão</p>
                  <p className="text-xl font-bold text-destructive">{contractsAtRisk.length}</p>
                </div>
                <div className="rounded-lg border bg-destructive/5 p-3">
                  <p className="text-xs text-muted-foreground">Valor total sob risco</p>
                  <p className="text-xl font-bold text-destructive">{money(riskValue)}</p>
                </div>
              </div>
              {duplicateFolders.map((folder) => (
                <details key={folder.key} className="group rounded-lg border bg-background">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40">
                    <span className="flex min-w-0 items-center gap-2 font-medium">
                      <Folder className="h-5 w-5 shrink-0 text-amber-500" />
                      <span className="truncate">{folder.name}</span>
                      <Badge variant="outline">{roleLabel(folder.role)}</Badge>
                    </span>
                    <Badge variant="secondary">{folder.groups.length} conflito(s)</Badge>
                  </summary>
                  <div className="max-h-[420px] space-y-3 overflow-y-auto border-t p-3">
                    <p className="text-xs text-muted-foreground">
                      Duplicidades dos cadastros que pertencem a {folder.name} (
                      {roleLabel(folder.role).toLowerCase()}).
                    </p>
                    {folder.groups.map((group) => (
                      <div
                        key={`${folder.key}:${group.tipo}:${group.chave}`}
                        className="rounded-lg border p-3"
                      >
                        <p className="mb-2 text-sm font-semibold">
                          Mesmo {group.tipo}:{" "}
                          {group.tipo === "cpf" ? `***${group.chave.slice(-4)}` : group.chave}
                        </p>
                        <div className="mb-3 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs">
                          <strong>Duplicado também encontrado em:</strong>{" "}
                          {Array.from(
                            new Set(
                              group.cadastros
                                .filter((person) => duplicateOwnerKey(person) !== folder.key)
                                .map(duplicateOwnerLabel),
                            ),
                          ).join(", ") || "na própria equipe"}
                        </div>
                        <div className="space-y-2">
                          {group.cadastros.map((person) => (
                            <div
                              key={person.id}
                              className="rounded-md bg-muted/40 px-3 py-2 text-sm"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <strong>{person.nome}</strong>
                                <Badge variant="outline">{person.tipo}</Badge>
                                <span className="text-xs text-muted-foreground">
                                  {person.is_voluntario
                                    ? "Voluntário"
                                    : Number(person.valor_contratacao || 0) > 0
                                      ? `Contrato de ${money(person.valor_contratacao || 0)}`
                                      : "Sem contrato"}
                                </span>
                                <Badge
                                  variant={
                                    duplicateOwnerKey(person) === folder.key
                                      ? "secondary"
                                      : "destructive"
                                  }
                                >
                                  {duplicateOwnerKey(person) === folder.key
                                    ? "Cadastro desta equipe"
                                    : "Duplicado em outra equipe"}
                                </Badge>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Localização do cadastro: {duplicateOwnerLabel(person)}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Contrato: {money(person.valor_contratacao || 0)}
                                {person.contrato_inicio
                                  ? ` • início ${format(new Date(`${person.contrato_inicio}T12:00:00`), "dd/MM/yyyy")}`
                                  : ""}
                                {person.contrato_fim
                                  ? ` • término ${format(new Date(`${person.contrato_fim}T12:00:00`), "dd/MM/yyyy")}`
                                  : " • sem término"}
                                {person.importacao_lote_nome
                                  ? ` • lote ${person.importacao_lote_nome}`
                                  : " • cadastro manual"}
                              </p>
                              {group.cadastros
                                .filter((other) => other.id !== person.id)
                                .every((other) => other.tipo === "cabo") && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="mt-2"
                                  disabled={busy}
                                  onClick={() => void resolveActiveDuplicate(group, person)}
                                >
                                  Manter este contrato e arquivar os duplicados
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico</CardTitle>
          <CardDescription>
            Lotes analisados e confirmados. Use “Ver ocorrências” para abrir os duplicados e
            inválidos encontrados em cada planilha.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Lote</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Linhas</TableHead>
                <TableHead>Contratos ativos</TableHead>
                <TableHead>Repetidos na planilha</TableHead>
                <TableHead>Inválidos</TableHead>
                <TableHead className="text-right">Custo</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeHistory.map((lot) => (
                <Fragment key={lot.id}>
                  <TableRow>
                    <TableCell>{format(new Date(lot.created_at), "dd/MM/yyyy HH:mm")}</TableCell>
                    <TableCell>
                      <p className="font-medium">{lot.nome}</p>
                      <p className="text-xs text-muted-foreground">{lot.arquivo_nome}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{lot.status}</Badge>
                    </TableCell>
                    <TableCell>{lot.total_linhas}</TableCell>
                    <TableCell>{lot.total_elegiveis}</TableCell>
                    <TableCell>{lot.total_repetidos_arquivo || 0}</TableCell>
                    <TableCell>{lot.total_invalidos}</TableCell>
                    <TableCell className="text-right">
                      {money(
                        lot.status === "confirmado"
                          ? lot.custo_confirmado
                          : lot.status === "cancelado"
                            ? 0
                            : lot.custo_previsto,
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          title="Editar valor ou responsável do lote"
                          onClick={() =>
                            setLotValueEdit({
                              id: lot.id,
                              valor: Number(lot.valor_unitario || 0)
                                .toFixed(2)
                                .replace(".", ","),
                              parentId: lot.parent_id_padrao || "",
                              motivo: "",
                            })
                          }
                        >
                          <Pencil className="mr-1 h-3.5 w-3.5" />
                          Editar lote
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => void loadManagedContracts(lot.id)}
                        >
                          Gerenciar contratos
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={
                            !lot.total_duplicados &&
                            !lot.total_repetidos_arquivo &&
                            !lot.total_invalidos
                          }
                          onClick={() => void loadAudit(lot.id)}
                        >
                          Ver ocorrências
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {lotValueEdit?.id === lot.id && (
                    <TableRow className="bg-muted/30">
                      <TableCell colSpan={9}>
                        <div className="flex flex-wrap items-end gap-3 rounded-md border bg-background p-3">
                          <div className="min-w-40 space-y-1">
                            <Label htmlFor={`valor-lote-${lot.id}`}>Novo valor por cabo</Label>
                            <Input
                              id={`valor-lote-${lot.id}`}
                              inputMode="decimal"
                              value={lotValueEdit.valor}
                              onChange={(event) =>
                                setLotValueEdit((current) =>
                                  current ? { ...current, valor: event.target.value } : current,
                                )
                              }
                            />
                          </div>
                          <div className="min-w-64 space-y-1">
                            <Label>Responsável pelo lote</Label>
                            <Select
                              value={lotValueEdit.parentId}
                              onValueChange={(parentId) =>
                                setLotValueEdit((current) =>
                                  current ? { ...current, parentId } : current,
                                )
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione um responsável" />
                              </SelectTrigger>
                              <SelectContent>
                                {parents.map((parent) => (
                                  <SelectItem key={parent.id} value={parent.id}>
                                    {parent.nome} · {roleLabel(parent.tipo)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="min-w-64 flex-1 space-y-1">
                            <Label htmlFor={`motivo-lote-${lot.id}`}>Motivo da alteração</Label>
                            <Input
                              id={`motivo-lote-${lot.id}`}
                              placeholder="Ex.: valor informado incorretamente na importação"
                              value={lotValueEdit.motivo}
                              onChange={(event) =>
                                setLotValueEdit((current) =>
                                  current ? { ...current, motivo: event.target.value } : current,
                                )
                              }
                            />
                          </div>
                          <Button disabled={busy} onClick={() => void saveLotValue()}>
                            {busy ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Save className="mr-2 h-4 w-4" />
                            )}
                            Salvar alteração
                          </Button>
                          <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() => setLotValueEdit(null)}
                          >
                            <X className="mr-2 h-4 w-4" />
                            Cancelar
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
              {!activeHistory.length && (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                    Nenhuma importação realizada.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {!!canceledHistory.length && (
            <details className="rounded-lg border border-dashed bg-muted/20">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                Análises canceladas ({canceledHistory.length}) — sem alteração de cadastros ou
                custos
              </summary>
              <div className="space-y-2 border-t px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  Estes arquivos foram apenas analisados e depois cancelados. Não criaram contratos
                  e não entram na auditoria financeira.
                </p>
                {canceledHistory.map((lot) => (
                  <div
                    key={lot.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium">{lot.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(lot.created_at), "dd/MM/yyyy HH:mm")} • {lot.arquivo_nome}{" "}
                        • {lot.total_linhas} linhas
                      </p>
                    </div>
                    <Badge variant="outline">Cancelado — R$ 0,00</Badge>
                  </div>
                ))}
              </div>
            </details>
          )}
          {managedLot && (
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><p className="font-medium">Contratos e linhas do lote</p><p className="text-xs text-muted-foreground">Todos os registros são exibidos. Contratos originados em outro lote aparecem somente para consulta.</p></div>
                <div className="flex gap-2">
                  <Button size="sm" variant="destructive" disabled={busy || !managedContracts.some((item) => item.pertence_ao_lote && !item.arquivado_em)} onClick={() => void archiveManagedLot()}><Trash2 className="mr-2 h-4 w-4" />Excluir todos os contratos deste lote</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setManagedLot(null); setManagedContracts([]); setContractEdit(null); setExpandedOccurrence(null); setExceptionReason(""); }}>Fechar</Button>
                </div>
              </div>
              <div className="max-h-[520px] overflow-auto rounded-md border">
                <Table><TableHeader><TableRow><TableHead>Linha</TableHead><TableHead>Nome</TableHead><TableHead>Telefone/CPF</TableHead><TableHead>Situação</TableHead><TableHead>Responsável</TableHead><TableHead>Valor</TableHead><TableHead /></TableRow></TableHeader>
                  <TableBody>{managedContracts.map((item) => <Fragment key={item.item_id}><TableRow><TableCell>{item.numero_linha}</TableCell><TableCell><p className="font-medium">{item.nome || item.nome_importado || "—"}</p>{!item.pertence_ao_lote && item.lote_contrato_nome && <p className="text-xs text-muted-foreground">Contrato no lote: {item.lote_contrato_nome}</p>}</TableCell><TableCell className="text-xs"><p>{item.telefone || item.telefone_importado || "—"}</p><p>{item.cpf || item.cpf_importado || "—"}</p></TableCell><TableCell><Badge variant={item.arquivado_em ? "secondary" : item.pertence_ao_lote ? "default" : "outline"}>{item.pessoa_id ? item.arquivado_em ? "Arquivado" : "Ativo" : classificationLabel[item.classificacao] || item.classificacao}</Badge><p className="mt-1 max-w-48 text-xs text-muted-foreground">{item.motivo}</p></TableCell><TableCell>{item.responsavel_nome || "—"}</TableCell><TableCell>{item.valor ? money(item.valor) : "—"}</TableCell><TableCell><div className="flex gap-1">{item.pertence_ao_lote && item.pessoa_id && <Button size="sm" variant="outline" onClick={() => setContractEdit({ ...item, valorTexto: Number(item.valor || 0).toFixed(2).replace(".", ","), ativo: !item.arquivado_em })}><Pencil className="mr-1 h-3.5 w-3.5" />Editar</Button>}{!item.pertence_ao_lote && <Button size="sm" variant="outline" onClick={() => { setExpandedOccurrence(expandedOccurrence === item.item_id ? null : item.item_id); setExceptionReason(""); }}>Ver ocorrência</Button>}</div></TableCell></TableRow>
                    {contractEdit?.item_id === item.item_id && <TableRow className="bg-muted/30"><TableCell colSpan={7}><div className="grid gap-3 rounded-md border bg-background p-3 md:grid-cols-3"><div><Label>Nome</Label><Input value={contractEdit.nome || ""} onChange={(e) => setContractEdit({ ...contractEdit, nome: e.target.value })} /></div><div><Label>Telefone</Label><Input value={contractEdit.telefone || ""} onChange={(e) => setContractEdit({ ...contractEdit, telefone: e.target.value })} /></div><div><Label>CPF</Label><Input value={contractEdit.cpf || ""} onChange={(e) => setContractEdit({ ...contractEdit, cpf: e.target.value })} /></div><div><Label>Valor</Label><Input value={contractEdit.valorTexto} onChange={(e) => setContractEdit({ ...contractEdit, valorTexto: e.target.value })} /></div><div><Label>Responsável</Label><Select value={contractEdit.responsavel_id || ""} onValueChange={(responsavel_id) => setContractEdit({ ...contractEdit, responsavel_id })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{parents.map((parent) => <SelectItem key={parent.id} value={parent.id}>{parent.nome} · {roleLabel(parent.tipo)}</SelectItem>)}</SelectContent></Select></div><div><Label>Status</Label><Select value={contractEdit.ativo ? "ativo" : "arquivado"} onValueChange={(status) => setContractEdit({ ...contractEdit, ativo: status === "ativo" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ativo">Ativo</SelectItem><SelectItem value="arquivado">Excluído/arquivado</SelectItem></SelectContent></Select></div><div><Label>Início</Label><Input type="date" value={contractEdit.contrato_inicio || ""} onChange={(e) => setContractEdit({ ...contractEdit, contrato_inicio: e.target.value })} /></div><div><Label>Término</Label><Input type="date" value={contractEdit.contrato_fim || ""} onChange={(e) => setContractEdit({ ...contractEdit, contrato_fim: e.target.value || null })} /></div><div className="flex items-end gap-2"><Button disabled={busy} onClick={() => void saveManagedContract()}><Save className="mr-2 h-4 w-4" />Salvar</Button><Button variant="outline" onClick={() => setContractEdit(null)}>Cancelar</Button></div></div></TableCell></TableRow>}
                    {expandedOccurrence === item.item_id && <TableRow className="bg-amber-50/60 dark:bg-amber-950/20"><TableCell colSpan={7}><div className="space-y-3 rounded-md border border-amber-300 p-3"><div><p className="font-semibold">Ocorrência deste contrato</p><p className="text-sm">{item.motivo || "Registro bloqueado pela validação automática."}</p></div><div className="grid gap-3 text-sm md:grid-cols-2"><div><p className="font-medium">Pessoa da planilha</p><p>{item.nome_importado || "—"}</p><p>Telefone: {item.telefone_importado || "—"}</p><p>CPF: {item.cpf_importado || "—"}</p></div><div><p className="font-medium">Cadastro que causou o bloqueio</p><p>{item.conflito_nome || "—"}</p><p>Telefone: {item.conflito_telefone || "—"}</p><p>CPF: {item.conflito_cpf || "—"}</p><p>Responsável: {item.conflito_responsavel || "—"}</p><p>Lote: {item.lote_contrato_nome || "Sem lote vinculado"}</p></div></div>{["duplicado_no_arquivo", "duplicado_contrato_ativo"].includes(item.classificacao) && item.telefone_importado && <div className="space-y-2 border-t pt-3"><p className="text-xs text-muted-foreground">Use somente quando forem pessoas diferentes que compartilham o mesmo telefone. CPF repetido continuará bloqueado.</p><Label>Motivo da exceção manual</Label><Input value={exceptionReason} onChange={(e) => setExceptionReason(e.target.value)} placeholder="Ex.: telefone compartilhado com o marido" /><Button disabled={busy || !exceptionReason.trim()} onClick={() => void approveSharedPhone(item)}><CheckCircle2 className="mr-2 h-4 w-4" />Validar contrato mesmo assim</Button></div>}</div></TableCell></TableRow>}
                  </Fragment>)}</TableBody></Table>
              </div>
            </div>
          )}
          {auditLot && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="font-medium">Duplicados e inválidos do lote</p>
                <div className="flex items-center gap-2">
                  {!!auditItems.length && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void gerarRelatorioOcorrenciasLotePdf(
                          history.find((lot) => lot.id === auditLot)?.nome || "Importação",
                          auditItems,
                        )
                      }
                    >
                      <Download className="mr-2 h-4 w-4" />
                      {auditItems[0]?.responsavel_tentativa_nome
                        ? `Baixar relatório para ${auditItems[0].responsavel_tentativa_nome}`
                        : "Baixar relatório deste lote"}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setAuditLot(null);
                      setAuditItems([]);
                    }}
                  >
                    Fechar
                  </Button>
                </div>
              </div>
              <ItemTable items={auditItems} />
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={quickParentOpen} onOpenChange={setQuickParentOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Cadastrar responsável</DialogTitle>
            <DialogDescription>
              Cadastre sem sair da importação. Ao salvar, o novo responsável será selecionado automaticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1"><Label>Tipo</Label><Select value={quickParent.tipo} onValueChange={(tipo: "coordenador" | "lider") => setQuickParent({ ...quickParent, tipo, coordenadorId: tipo === "coordenador" ? "" : quickParent.coordenadorId })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="lider">Líder</SelectItem><SelectItem value="coordenador">Coordenador</SelectItem></SelectContent></Select></div>
            <div className="space-y-1"><Label>Nome</Label><Input value={quickParent.nome} onChange={(e) => setQuickParent({ ...quickParent, nome: e.target.value })} /></div>
            <div className="space-y-1"><Label>Telefone</Label><Input value={quickParent.telefone} onChange={(e) => setQuickParent({ ...quickParent, telefone: e.target.value })} inputMode="tel" placeholder="(67) 99999-9999" /></div>
            <div className="space-y-1"><Label>Valor da contratação</Label><Input value={quickParent.valor} onChange={(e) => setQuickParent({ ...quickParent, valor: e.target.value })} inputMode="decimal" placeholder="Ex.: 1.000,00" /><p className="text-xs text-muted-foreground">A vigência usará as datas de início e término desta importação.</p></div>
            {quickParent.tipo === "lider" && <div className="space-y-1 sm:col-span-2"><Label>Coordenador acima do líder (opcional)</Label><Select value={quickParent.coordenadorId || "avulso"} onValueChange={(coordenadorId) => setQuickParent({ ...quickParent, coordenadorId: coordenadorId === "avulso" ? "" : coordenadorId })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="avulso">Líder avulso</SelectItem>{coordenadores.map((item) => <SelectItem key={item.id} value={item.id}>{item.nome}</SelectItem>)}</SelectContent></Select></div>}
            {!(quickParent.tipo === "lider" && quickParent.coordenadorId) && <>
              <div className="space-y-1"><Label>Local</Label><Select value={quickParent.escopo} onValueChange={(escopo: "campo_grande" | "interior") => setQuickParent({ ...quickParent, escopo })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="campo_grande">Campo Grande</SelectItem><SelectItem value="interior">Interior</SelectItem></SelectContent></Select></div>
              {quickParent.escopo === "campo_grande" ? <div className="space-y-1"><Label>Região</Label><Select value={quickParent.regiao} onValueChange={(regiao) => setQuickParent({ ...quickParent, regiao })}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{regioes.map((item) => <SelectItem key={item.id} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div> : <div className="space-y-1"><Label>Cidade</Label><Input value={quickParent.cidade} onChange={(e) => setQuickParent({ ...quickParent, cidade: e.target.value })} /></div>}
            </>}
            {quickParent.tipo === "lider" && quickParent.coordenadorId && <p className="text-sm text-muted-foreground sm:col-span-2">O líder herdará automaticamente a cidade ou região do coordenador selecionado.</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickParentOpen(false)}>Cancelar</Button>
            <Button disabled={busy} onClick={() => void saveQuickParent()}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Cadastrar e selecionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ItemTable({ items }: { items: ImportItem[] }) {
  const visibleItems = items.slice(0, 1000);
  return (
    <div className="space-y-2">
      {items.length > visibleItems.length && (
        <p className="text-xs text-muted-foreground">
          Exibindo 1.000 de {items.length.toLocaleString("pt-BR")} registros para manter a tela
          rápida. Todos foram processados e continuam disponíveis na exportação.
        </p>
      )}
      <div className="max-h-[420px] overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Linha</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>CPF</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead>Onde está o contrato ativo</TableHead>
              <TableHead className="text-right">Valor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleItems.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.numero_linha + 1}</TableCell>
                <TableCell>{item.nome || "—"}</TableCell>
                <TableCell>
                  {item.cpf_normalizado
                    ? `***.***.${item.cpf_normalizado.slice(-5, -2)}-${item.cpf_normalizado.slice(-2)}`
                    : "—"}
                </TableCell>
                <TableCell>{item.telefone_normalizado || "—"}</TableCell>
                <TableCell>
                  <Badge variant={item.classificacao === "confirmado" ? "default" : "outline"}>
                    {classificationLabel[item.classificacao] || item.classificacao}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-xs text-xs">{item.motivo}</TableCell>
                <TableCell className="min-w-[280px] text-xs">
                  {item.duplicado ? (
                    <div className="space-y-1 rounded-md border border-destructive/20 bg-destructive/5 p-2">
                      <p>
                        <strong>{item.duplicado.nome}</strong> ({item.duplicado.tipo})
                      </p>
                      <p>
                        Responsável: {item.duplicado.responsavel_nome || "sem responsável"}
                        {item.duplicado.responsavel_tipo
                          ? ` (${roleLabel(item.duplicado.responsavel_tipo).toLowerCase()})`
                          : ""}
                      </p>
                      <p>
                        Contrato: {money(item.duplicado.valor_contratacao || 0)}
                        {item.duplicado.contrato_inicio
                          ? ` • início ${format(new Date(`${item.duplicado.contrato_inicio}T12:00:00`), "dd/MM/yyyy")}`
                          : ""}
                        {item.duplicado.contrato_fim
                          ? ` • término ${format(new Date(`${item.duplicado.contrato_fim}T12:00:00`), "dd/MM/yyyy")}`
                          : " • sem término"}
                      </p>
                      <p>Telefone cadastrado: {item.duplicado.telefone || "—"}</p>
                    </div>
                  ) : item.repetido_no_arquivo ? (
                    <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-2 text-amber-950">
                      <p className="font-medium">Repetido dentro desta planilha</p>
                      <p>Primeira ocorrencia: linha {item.repetido_no_arquivo.numero_linha + 1}</p>
                      <p>{item.repetido_no_arquivo.nome || "Sem nome"}</p>
                      <p>Telefone: {item.repetido_no_arquivo.telefone_normalizado || "-"}</p>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">
                      Não se aplica ou duplicado somente dentro da planilha.
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">{money(item.valor_aplicado)}</TableCell>
              </TableRow>
            ))}
            {!items.length && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  <AlertTriangle className="mx-auto mb-2 h-5 w-5" />
                  Nenhum registro nesta categoria.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
