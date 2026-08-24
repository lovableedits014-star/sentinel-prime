ALTER TABLE public.eleicao_pessoas
  ADD COLUMN IF NOT EXISTS vigencia_inicio date,
  ADD COLUMN IF NOT EXISTS vigencia_fim date;

-- garante 1 modelo por tipo por campanha (remove duplicados antigos mantendo o mais recente)
DELETE FROM public.contract_templates ct
USING public.contract_templates ct2
WHERE ct.client_id = ct2.client_id
  AND ct.tipo = ct2.tipo
  AND ct.created_at < ct2.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS contract_templates_client_tipo_key
  ON public.contract_templates (client_id, tipo);

INSERT INTO public.contract_templates (client_id, tipo, titulo, conteudo)
SELECT c.id, t.tipo, t.titulo, t.conteudo
FROM public.clients c
CROSS JOIN (
  VALUES
  ('eleicao_coordenador', 'Contrato de Prestação de Serviços na Campanha Eleitoral', $ct$CONTRATO DE PRESTAÇÃO DE SERVIÇOS NA CAMPANHA ELEITORAL

CONTRATANTE: ELEIÇÃO 2026 ADEMAR VIEIRA JUNIOR DEPUTADO ESTADUAL, inscrita no CNPJ: 68.499.966/0001-59, com seu Comitê instalado à Rua Genciana, Nº 300 – Bairro Jardim Nova Jerusalém, em Campo Grande - MS, na qualidade de candidato a Deputado Estadual pelo Partido MDB.

CONTRATADO (A): {nome}, brasileiro (a), regularmente inscrito(a) no CPF sob o nº. _____________________, e no RG _____________________, expedido por ____________, residente e domiciliado a {rua}, {numero} – {bairro} – CEP ______________, Cidade: {cidade}; Mato Grosso do Sul.

Têm entre si justos e acertados os serviços abaixo descritos, sob disciplina da Resolução TSE nº. 23.607/2019, e conforme as cláusulas a seguir estabelecidas:

CLÁUSULA PRIMEIRA: Constitui objeto deste contrato o exercício das funções de prestador de serviços de cabo eleitoral, por parte do CONTRATADO (A), na Campanha Eleitoral do ora CONTRATANTE.

Parágrafo Primeiro: No termo do art.35 §12 da Resolução 23.607/2019, o contratado deverá preencher diariamente relatório das atividades realizadas, conforme planejamento da direção de campanha.

Parágrafo Segundo: Compete ao cabo eleitoral, cumprir seu horário com visitas e distribuição de material eleitoral, apresentando e divulgando os trabalhos do candidato.

Parágrafo Terceiro: Conforme solicitado, o cabo eleitoral deve participar de reuniões eleitorais, bandeiradas, carreatas ou quaisquer outros eventos durante o período de contratação.

CLÁUSULA SEGUNDA: O presente contrato terá início em {vigencia_inicio} e término em {vigencia_fim}.

CLÁUSULA TERCEIRA: Pelos serviços ora contratados, o CONTRATANTE pagará ao CONTRATADO (A) a importância de R$ {valor} ({valor_extenso}), que serão pagos pelo período determinado na Cláusula Segunda.

Parágrafo Primeiro: Caso haja rescisão do contrato antes de completado o período integral, o pagamento será proporcional ao período efetivamente trabalhado.

Parágrafo Segundo: O pagamento dos serviços contratados será efetuado por meio de transferência bancária, ao próprio contratado, no banco _______________________, agência ___________________, conta corrente/poupança ____________________, chave Pix ______________________, e ou cheque nominal e cruzado, sendo expressamente vedado o pagamento em espécie, conforme disposto na art. 40, da Resolução n. 23.607/2019 expedida pelo TSE.

CLÁUSULA QUARTA: O CONTRATANTE não fornecerá vale transporte e nem ajuda de custo para esse fim ao CONTRATADO.

CLÁUSULA QUINTA: O presente Contrato de Trabalho não gera vínculo empregatício, por força do artigo 100, da Lei nº 9.504, de 30/09/1997 – DOU de 01/10/1997 que diz: "A contratação de pessoal para prestação de serviços nas campanhas eleitorais não gera vínculo empregatício com o candidato ou partido Contratante".

CLÁUSULA SEXTA: O Contratado declara neste ato que não é beneficiário de Auxílio Governamental e/ou Previdenciário, de qualquer natureza, sob as penas da Lei.

CLÁUSULA SÉTIMA: As partes elegem o Foro da Comarca de Campo Grande – MS, para dirimirem quaisquer conflitos oriundos do presente contrato.

Campo Grande, {dia} de {mes} de {ano}


_______________________________________
ELEIÇÃO 2026 ADEMAR VIEIRA JUNIOR
DEPUTADO ESTADUAL
CNPJ: 68.499.966/0001-59


_______________________________________
{nome}
CPF: _____________________$ct$),
  ('eleicao_distrato_coordenador', 'Distrato de Prestação de Serviços de Cabo Eleitoral', $dt$DISTRATO DE PRESTAÇÃO DE SERVIÇOS DE CABO ELEITORAL

Pelo presente instrumento e em virtude do Contrato de Prestação de Serviços de Cabo Eleitoral, firmado entre ELEIÇÃO 2026 ADEMAR VIEIRA JUNIOR DEPUTADO ESTADUAL, portador do CNPJ Nº 68.499.966/0001-59, situado à Rua Genciana, Nº 300 – Bairro Jardim Nova Jerusalém, nesta Capital, na qualidade de candidato a Deputado Estadual pelo MDB, e {nome}, portador do CPF: _____________________, resolvem, neste ato, de comum acordo, rescindi-lo, como de fato rescindido fica a partir da presente data.

As partes dão plena quitação, para nada mais reclamarem a qualquer tempo ou a qualquer título e em virtude do referido contrato de prestação de serviços.

E por estarem assim justos e acordados, firmam o presente instrumento em duas vias de igual teor.

Campo Grande/MS, {dia} de {mes} de {ano}.


_______________________________________
ELEIÇÃO 2026 ADEMAR VIEIRA JUNIOR
DEPUTADO ESTADUAL
CNPJ: 68.499.966/0001-59


_______________________________________
{nome}
CPF: _____________________$dt$)
) AS t(tipo, titulo, conteudo)
WHERE NOT EXISTS (
  SELECT 1 FROM public.contract_templates x WHERE x.client_id = c.id AND x.tipo = t.tipo
);

-- replica o mesmo texto para Líder e Cabo (contrato e distrato), quando ainda não existirem
INSERT INTO public.contract_templates (client_id, tipo, titulo, conteudo)
SELECT base.client_id, v.tipo, base.titulo, base.conteudo
FROM public.contract_templates base
CROSS JOIN (VALUES ('eleicao_lider'), ('eleicao_cabo')) AS v(tipo)
WHERE base.tipo = 'eleicao_coordenador'
  AND NOT EXISTS (
    SELECT 1 FROM public.contract_templates x WHERE x.client_id = base.client_id AND x.tipo = v.tipo
  );

INSERT INTO public.contract_templates (client_id, tipo, titulo, conteudo)
SELECT base.client_id, v.tipo, base.titulo, base.conteudo
FROM public.contract_templates base
CROSS JOIN (VALUES ('eleicao_distrato_lider'), ('eleicao_distrato_cabo')) AS v(tipo)
WHERE base.tipo = 'eleicao_distrato_coordenador'
  AND NOT EXISTS (
    SELECT 1 FROM public.contract_templates x WHERE x.client_id = base.client_id AND x.tipo = v.tipo
  );