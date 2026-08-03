# Engajamento como painel de gestão do time

## O que eu verifiquei no sistema (medido agora)

- A aba **Perfis do Time** lê **somente a tabela `pessoas` (38 registros)**. Por isso quase ninguém aparece: os **444 registros de coordenadores/líderes/cabos** (`eleicao_pessoas`), os **2 funcionários** (`funcionarios`) e as **30 contas do portal** (`supporter_accounts`) ficam de fora. É a causa principal de "não carrega todos".
- O **Ranking completo tem corte fixo em 50 pessoas** no código, mesmo que existam mais. Além disso as listas de pessoas/funcionários são buscadas sem paginação (teto de 1.000 por consulta), então em bases maiores parte do time é ignorada no cruzamento.
- **Não existe nenhuma edição de cargo em Engajamento**: a tabela só permite editar Instagram e vincular Facebook. O cargo de verdade está espalhado por tabelas diferentes (`pessoas`, `funcionarios`, `eleicao_pessoas`), e o tipo "funcionário" nem existe na lista de tipos de `pessoas` — por isso trocar Apoiador → Funcionário é impossível hoje pela tela.
- A busca por nome funciona, mas só procura **entre as 38 pessoas já carregadas** e entre autores de comentários. Como o time real está nas outras tabelas, "não acha muitas pessoas".
- Existem **2.803 autores distintos** de comentários captados (7.183 comentários) — matéria-prima suficiente para sugerir vínculos automaticamente.
- Já existem funções prontas de consulta de rede social (`preview-social-profile`, `resolve-social-link`) usadas nos cadastros públicos, mas **não estão sendo usadas em Engajamento**. É o que resolve o "tenho que procurar fora e colar o link".

## O plano

### Entrega 1 — Ver o time inteiro (base para tudo)

- Nova consulta única de time que junta **pessoas + funcionários + coordenadores/líderes/cabos + contratados + contas do portal**, sem duplicar quem aparece em mais de um lugar (dedupe por telefone e nome normalizado, com prioridade para o cargo mais alto).
- A tabela passa a ter: Nome, **Cargo**, Origem, Região/Cidade, Instagram, Facebook, Interações, Status, Última interação.
- Filtros por **cargo**, **status de rastreamento**, **região/cidade** e busca por nome ou telefone; paginação real (sem teto de 50 nem de 1.000).
- Contadores no topo: total do time, com @ cadastrado, rastreáveis, sem nenhuma rede.

### Entrega 2 — Trocar o cargo levando tudo

- Botão **Alterar cargo** em cada linha, com os cargos reais: Apoiador, Funcionário, Coordenador, Líder, Cabo eleitoral, Eleitor, Influenciador, Jornalista, Voluntário.
- A troca **move o cadastro de verdade** para a tabela do novo cargo, preservando: telefone, endereço/região, redes sociais vinculadas, histórico de interações, missões e o vínculo de apoiador (`supporter_id`). Nada de registro duplicado nem perda de histórico.
- Regras de segurança do que já existe:
  - Ao promover para Coordenador/Líder, entra no fluxo de escopo já existente (cidade/região) — reaproveita a propagação de escopo que já criamos.
  - Ao rebaixar quem tem subordinados, reaproveita o tratamento de "órfãos" já implementado (pergunta antes e converte em avulsos).
  - Se o cargo exigir telefone e o cadastro não tiver, a tela pede o telefone antes de concluir, em vez de falhar com erro de banco.
- Registro em log de auditoria de cada troca (quem mudou, de que cargo para qual, quando).

### Entrega 3 — Cadastro de rede social que realmente encontra a pessoa

- A busca por nome passa a consultar **o time inteiro no servidor** (todas as tabelas), não apenas as linhas já carregadas — com resultado enquanto digita, tolerante a acento e nome parcial, e busca também por telefone.
- Três formas de resolver o @ na mesma tela:
  1. **Digitar/colar** @ ou URL (Instagram e Facebook) — normaliza sozinho.
  2. **Consultar o perfil** com o mesmo verificador dos cadastros públicos: mostra foto, nome e confirma se o perfil existe antes de salvar (fim do "colar link no escuro").
  3. **Sugestões automáticas**: entre os 2.803 autores já captados, o sistema ordena os mais parecidos com o nome digitado e mostra foto + nº de comentários para você confirmar com um clique — é a única forma de o Facebook ficar rastreável.
- Modo **cadastro em série**: ao salvar, volta ao campo de nome já pronto para a próxima pessoa, mostrando quantas interações passadas foram reaproveitadas.
- Botão **Sugerir vínculos** que roda a comparação de nomes em lote e apresenta uma fila de confirmações prováveis (nunca vincula sozinho).

### Entrega 4 — Cobrança dos funcionários e relatórios em PDF

Metas conforme você definiu: **interagir nas publicações** e **compartilhar (missões do portal)**.

- Nova aba **Cobrança do time** com configuração simples por cargo: nº mínimo de interações no período e nº mínimo de missões concluídas.
- Painel por pessoa com semáforo: **Em dia**, **Abaixo da meta**, **Zerado no período**, **Sem @ cadastrado** (esse último é falha de cadastro, não de esforço — fica separado para não distorcer a cobrança).
- Colunas: interações (IG/FB), missões recebidas, missões abertas, missões concluídas, última interação, dias sem interagir.
- **Relatório em PDF** no mesmo padrão dos seus relatórios atuais:
  - Capa com período e resumo (total do time, em dia, abaixo da meta, zerados);
  - Agrupado por **cargo** e, dentro dele, por **região** em ordem alfabética, depois por nome — mesma organização que você pediu nas exportações de Eleição;
  - Uma seção final "Precisam de cobrança" com nome, telefone e o que faltou.
- Também um PDF individual por pessoa (histórico de interações e missões do período), útil para conversa direta.

## Ordem de execução

1. Entrega 1 (visão completa do time) — libera todo o resto.
2. Entrega 2 (troca de cargo).
3. Entrega 3 (busca e cadastro de redes).
4. Entrega 4 (metas + PDF).

## Detalhes técnicos

- Nova função de banco `engagement_time_overview(client_id, days, filtros, paginação)` substituindo `engagement_perfis_overview`, unindo `pessoas`, `funcionarios`, `eleicao_pessoas`, `contratados`, `contratado_indicados`, `supporter_accounts`, com dedupe por telefone normalizado + nome sem acento e coluna `origem`/`cargo`. `SECURITY DEFINER` com a checagem `is_client_member` que já é usada.
- `engagement_alterar_cargo(pessoa_ref, origem_atual, novo_cargo, extras)`: transação que cria o registro no destino, migra `supporter_id`/`supporter_profiles`/`pessoa_social`, reescreve referências e remove a origem; reaproveita `ensure_supporter_for_entity`, `eleicao_pessoas_propagate_scope` e o tratamento de órfãos existente. Grava em `action_logs`.
- `engagement_buscar_time(client_id, termo)` para o autocomplete server-side (limite 20, ordenado por similaridade), evitando trazer 400+ linhas ao navegador.
- Ranking: remover o `.slice(0, 50)` de `InfluenciadoresTab.tsx`, paginar as consultas de entidades e passar o cruzamento para a nova função de banco, mantendo o cálculo de score atual intacto.
- Cadastro de redes: reuso de `SocialConnectFlow` (que já chama `preview-social-profile`/`resolve-social-link`) dentro de `CadastrarPerfilDialog.tsx`, e de `engagement_upsert_social`/`engagement_link_author` para gravar.
- Metas: nova tabela `engagement_metas` (por cliente e cargo) + função de apuração que soma `comments`, `engagement_actions` e `mission_events`/`mission_distributions` no período.
- PDF: reuso do gerador já existente (`jspdf` + `jspdf-autotable`) com a ordenação por região que já está implementada em `eleicao-export-pdf`.
- Nada dos módulos de disparo/WhatsApp, missões públicas ou telemarketing é alterado.
