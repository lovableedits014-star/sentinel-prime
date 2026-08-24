# Plano — Relatório de resultados por indicador

## Objetivo
Corrigir a divergência entre as ligações registradas e o relatório, e transformar a aba **Relatórios** em um painel confiável para medir separadamente cada coordenador, líder ou cabo que indicou contatos.

## Diagnóstico confirmado
- Os registros reais de Cleiton estão gravados: **30 indicados, 14 trabalhados, 2 “sim”, 1 “não”, 4 indecisos e 7 “não atendeu”**.
- O detalhe individual lê os campos corretos e por isso mostra resultados; o resumo exibido no print ficou desatualizado/zerado em relação aos mesmos contatos.
- O relatório geral atual perde o vínculo de contatos da Eleição com a pessoa que os indicou.
- Os snapshots de rodadas ignoram `eleicao_indicados`, portanto também produzem comparações incompletas.
- As exportações atuais são apenas CSV/PDF do relatório geral; não existe Excel real nem exportação do painel por indicador.

## Implementação

### 1. Fonte única e auditável dos resultados
- Consolidar o relatório por indicador em uma RPC própria, usando os campos efetivamente gravados após a ligação: `ultima_ligacao_em`, `ultimo_status_ligacao` e `vota_candidato`.
- Manter dois conceitos separados para evitar números enganosos:
  - **Pessoas trabalhadas:** contatos únicos que já receberam ao menos uma tentativa.
  - **Tentativas realizadas:** quantidade de ligações registrada no histórico.
- Retornar todos os resultados: sim, não, indeciso, não atendeu, recusou, inválido, pendente e reagendado.
- Garantir que resumo, ranking, detalhe, gráficos e exportações consumam a mesma fonte e os mesmos filtros.
- Atualizar automaticamente os dados ao abrir a aba e oferecer ação de atualizar, evitando painel antigo após novas ligações.

### 2. Filtros gerenciais
Adicionar filtros combináveis no topo do relatório:
- campanha/lista de ligação;
- pessoa que indicou, com pesquisa por nome;
- cargo do indicador: coordenador, líder ou cabo;
- período da ligação;
- operador;
- resultado da ligação;
- intenção de voto;
- região, cidade e bairro quando disponíveis.

Exibir claramente os filtros ativos e uma ação para limpar todos. O filtro selecionado deve controlar simultaneamente KPIs, gráficos, tabela detalhada e exportações.

### 3. Painel sem nota única
Substituir o “score” por indicadores objetivos e com denominadores visíveis:
- total indicado;
- pessoas trabalhadas e cobertura da lista (`trabalhados ÷ indicados`);
- tentativas realizadas;
- atendidos e taxa de contato (`atendidos ÷ trabalhados`);
- sim, não e indecisos;
- conversão entre atendidos (`sim ÷ atendidos`);
- voto efetivo sobre a base (`sim ÷ total indicado`);
- não atendeu, recusou e números inválidos;
- pendentes e reagendados.

Criar um funil visual **Indicados → Trabalhados → Atendidos → Sim**, além de uma tabela comparativa por indicador. O usuário poderá ordenar por qualquer métrica, sem classificação subjetiva.

### 4. Visão individual de cada indicador
- Ao selecionar/clicar em uma pessoa, abrir um relatório individual com resumo, funil, distribuição de respostas e contatos detalhados.
- Mostrar nome, telefone, bairro/cidade, status, intenção de voto, operador, última ligação, quantidade de tentativas e próxima tentativa.
- Permitir busca dentro do detalhe e filtros de resultado/período.
- Sinalizar grupos úteis para ação: indecisos a recuperar, não atendidos para retorno, telefones inválidos e votos confirmados.

### 5. Exportações geral e individual
- **Excel geral:** aba “Resumo por indicador” e aba “Contatos detalhados”, respeitando todos os filtros ativos.
- **Excel individual:** resumo e lista completa somente da pessoa selecionada.
- **PDF geral:** KPIs, funil e tabela comparativa por indicador.
- **PDF individual:** identificação do indicador, métricas, distribuição de resultados e contatos filtrados.
- Incluir no cabeçalho período, campanha e demais filtros utilizados, data/hora de geração e definições das taxas.
- Remover o limite silencioso atual de 500 registros; PDF será paginado e Excel levará todos os registros filtrados.

### 6. Rodadas e evolução
- Corrigir snapshots para incluir também os indicados da Eleição.
- Salvar comparativos por indicador, campanha e data, permitindo acompanhar evolução entre rodadas.
- Exibir variações objetivas: novos trabalhados, novos atendidos, novos “sim”, indecisos recuperados e inválidos identificados.

### 7. Segurança e consistência
- Exigir validação do cliente autenticado nas RPCs administrativas do relatório.
- Preservar RLS e não expor dados de outro cliente.
- Manter o histórico de ligações como trilha de auditoria e conferir totais agregados contra os contatos detalhados.

## Validação
- Usar Cleiton como caso de conferência: o painel deve refletir os mesmos totais encontrados no detalhe e no histórico.
- Registrar resultados de teste para “sim”, “não”, “indeciso”, “não atendeu”, “recusou”, “inválido” e reagendamento e confirmar atualização em todas as visões.
- Comparar total do painel, soma da tabela, Excel e PDF sob os mesmos filtros.
- Validar filtros isolados e combinados, exportação geral e individual e comportamento em desktop/mobile.
