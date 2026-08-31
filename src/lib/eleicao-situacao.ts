export type EleicaoSituacao = "contratado" | "sem_contrato" | "voluntario" | "arquivado";

export interface EleicaoPessoaSituacao {
  valor_contratacao?: number | null;
  is_voluntario?: boolean | null;
  arquivado_em?: string | null;
}

export function getEleicaoSituacao(pessoa: EleicaoPessoaSituacao): EleicaoSituacao {
  if (pessoa.arquivado_em) return "arquivado";
  if (pessoa.is_voluntario) return "voluntario";
  return Number(pessoa.valor_contratacao || 0) > 0 ? "contratado" : "sem_contrato";
}

export const isEleicaoAtivo = (pessoa: EleicaoPessoaSituacao) => !pessoa.arquivado_em;
export const isEleicaoContratado = (pessoa: EleicaoPessoaSituacao) => getEleicaoSituacao(pessoa) === "contratado";
export const isEleicaoSemContrato = (pessoa: EleicaoPessoaSituacao) => getEleicaoSituacao(pessoa) === "sem_contrato";
export const isEleicaoVoluntario = (pessoa: EleicaoPessoaSituacao) => getEleicaoSituacao(pessoa) === "voluntario";

export const ELEICAO_SITUACAO_LABEL: Record<EleicaoSituacao, string> = {
  contratado: "Contratado",
  sem_contrato: "Sem contrato",
  voluntario: "Voluntário",
  arquivado: "Arquivado",
};
