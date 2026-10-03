export interface PessoaPesquisavel {
  nome: string;
  telefone?: string | null;
  endereco?: string | null;
}

function normalizarTexto(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

export function correspondeBuscaEleicao(pessoa: PessoaPesquisavel, busca: string) {
  const termo = busca.trim();
  if (!termo) return true;

  const termoNormalizado = normalizarTexto(termo);
  const textoPesquisavel = normalizarTexto(`${pessoa.nome} ${pessoa.endereco || ""}`);
  const encontrouTexto = termoNormalizado
    .split(/\s+/)
    .filter(Boolean)
    .every((parte) => textoPesquisavel.includes(parte));
  const telefoneBusca = termo.replace(/\D/g, "");
  const telefoneBuscaSemPrefixo = telefoneBusca.replace(/^0+/, "");
  const telefonePessoa = (pessoa.telefone || "").replace(/\D/g, "");
  const encontrouTelefone =
    telefoneBusca.length > 0 &&
    (telefonePessoa.includes(telefoneBusca) ||
      (telefoneBuscaSemPrefixo.length > 0 && telefonePessoa.includes(telefoneBuscaSemPrefixo)));

  return encontrouTexto || encontrouTelefone;
}
