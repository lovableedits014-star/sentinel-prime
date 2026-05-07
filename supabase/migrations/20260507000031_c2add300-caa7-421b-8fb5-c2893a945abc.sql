-- Insert default eleicao contract templates for each client that doesn't have them
INSERT INTO public.contract_templates (client_id, tipo, titulo, conteudo)
SELECT c.id, 'eleicao_coordenador', 'Contrato — Coordenador',
'CONTRATO DE PRESTAÇÃO DE SERVIÇOS — COORDENADOR DE CAMPANHA

Data: {data}

CONTRATANTE: {contratante}

CONTRATADO(A) — COORDENADOR(A):
Nome: {nome}
Telefone: {telefone}
Endereço: {endereco}
Cidade: {cidade}
Região: {regiao}

OBJETO:
O(A) CONTRATADO(A), na qualidade de COORDENADOR(A), responsabiliza-se por organizar líderes e cabos eleitorais da sua região, supervisionar metas e reportar resultados ao(à) CONTRATANTE.

VALOR DO CONTRATO:
R$ {valor} ({valor_extenso}).

VIGÊNCIA:
Da assinatura até o término do período eleitoral.


___________________________          ___________________________
       CONTRATANTE                              {nome}'
FROM public.clients c
WHERE NOT EXISTS (
  SELECT 1 FROM public.contract_templates t WHERE t.client_id=c.id AND t.tipo='eleicao_coordenador'
);

INSERT INTO public.contract_templates (client_id, tipo, titulo, conteudo)
SELECT c.id, 'eleicao_lider', 'Contrato — Líder',
'CONTRATO DE PRESTAÇÃO DE SERVIÇOS — LÍDER DE MOBILIZAÇÃO

Data: {data}

CONTRATANTE: {contratante}

CONTRATADO(A) — LÍDER:
Nome: {nome}
Telefone: {telefone}
Endereço: {endereco}
Cidade: {cidade}
Região: {regiao}
Coordenador responsável: {coordenador}

OBJETO:
Coordenar e supervisionar a equipe de cabos eleitorais sob sua responsabilidade, garantir cumprimento de metas e reportar resultados.

VALOR DO CONTRATO:
R$ {valor} ({valor_extenso}).

VIGÊNCIA:
Da assinatura até o término do período eleitoral.


___________________________          ___________________________
       CONTRATANTE                              {nome}'
FROM public.clients c
WHERE NOT EXISTS (
  SELECT 1 FROM public.contract_templates t WHERE t.client_id=c.id AND t.tipo='eleicao_lider'
);

INSERT INTO public.contract_templates (client_id, tipo, titulo, conteudo)
SELECT c.id, 'eleicao_cabo', 'Contrato — Cabo Eleitoral',
'CONTRATO DE PRESTAÇÃO DE SERVIÇOS — CABO ELEITORAL

Data: {data}

CONTRATANTE: {contratante}

CONTRATADO(A) — CABO ELEITORAL:
Nome: {nome}
Telefone: {telefone}
Endereço: {endereco}
Cidade: {cidade}
Região: {regiao}
Líder responsável: {lider}

OBJETO:
Realizar mobilização porta a porta e digital, captar apoiadores e cumprir metas estipuladas pela liderança.

VALOR DO CONTRATO:
R$ {valor} ({valor_extenso}).

VIGÊNCIA:
Da assinatura até o término do período eleitoral.


___________________________          ___________________________
       CONTRATANTE                              {nome}'
FROM public.clients c
WHERE NOT EXISTS (
  SELECT 1 FROM public.contract_templates t WHERE t.client_id=c.id AND t.tipo='eleicao_cabo'
);