# Engajamento: cadastrar @s do time e medir interações

## O que eu verifiquei no sistema hoje

A aba **Engajamento → Influenciadores** não tem base própria: ela cruza, no navegador, três coisas:

1. **Quem é cadastrado** — `pessoas` (CRM), `funcionarios`, `contratados`, `contratado_indicados`, `supporter_accounts` (portal).
2. **Quais @s pertencem a cada cadastro** — `supporter_profiles`, `pessoa_social`, e os campos `instagram_username` / `facebook_username` de `supporter_accounts`.
3. **As interações** — tabela `comments` (comentários captados do Facebook/Instagram) e `engagement_actions`.

O cruzamento é feito por `plataforma:@handle` do comentário contra os @s cadastrados. Ou seja: **o @ é a chave**. Sem @ correto cadastrado, a pessoa não aparece no ranking.

### Problemas reais encontrados (confirmados por consulta ao banco)

- **A tabela `supporters` está vazia (0 registros)**, mas existem 44 registros em `supporter_profiles` e 28 pessoas com `supporter_id` preenchido apontando para linhas que não existem mais. Como `supporter_profiles.supporter_id` tem chave estrangeira para `supporters`, **cadastrar um @ novo hoje pode falhar** ou gravar um vínculo órfão. Essa é a causa raiz a corrigir antes de qualquer cadastro manual.
- **Instagram funciona por @** — os comentários do Instagram gravam `platform_user_id` = o próprio @ (ex.: `paulinhobritto`). Então cadastrar `@usuario` do Instagram casa perfeitamente.
- **Facebook NÃO funciona por @** — os comentários do Facebook gravam um ID numérico interno de 17 dígitos (ex.: `25945089808510277`), que é gerado pela Meta por aplicativo e **não pode ser deduzido do @ público** da pessoa. Cadastrar `facebook.com/nome.sobrenome` não vai casar com nada. Hoje 12 registros de Facebook estão gravados como `share_XXXX`, que também não casa.
- **Curtidas e compartilhamentos não são coletados hoje.** `engagement_actions` só tem ações do tipo `comment` (35 registros) e a tabela `reactions` está vazia. A coleta atual (`fetch-meta-comments`) busca apenas comentários.

## O plano

### Etapa 1 — Consertar a base de identidade (obrigatória, invisível para você)

- Recriar em `supporters` as linhas faltantes a partir de `pessoas`, `funcionarios` e `supporter_accounts` que já têm `supporter_id`, reaproveitando os mesmos IDs — assim os 44 vínculos existentes voltam a valer e nada é perdido.
- Garantir por trigger/função que ao cadastrar um @ para uma pessoa, o `supporter` correspondente seja criado automaticamente se não existir.
- Limpar os registros `share_XXXX` do Facebook (deixam de poluir o ranking) mantendo a URL original salva em `pessoa_social` para consulta manual.

### Etapa 2 — Tela de cadastro e administração dos @s (é aqui que você trabalha)

Nova aba **Engajamento → Perfis do time**, com uma tabela única de administração:

- Lista de todas as pessoas cadastradas (CRM, funcionários, contratados, apoiadores) com colunas: Nome, Categoria, @ Instagram, Perfil Facebook, Status do vínculo, Interações no período.
- Cadastro/edição inline por pessoa: campo de Instagram (aceita `@nome`, `nome` ou URL — normaliza sozinho) e campo de Facebook.
- **Status do vínculo** com semáforo, para você saber se o cadastro está realmente funcional:
  - Verde “Rastreável” — @ casa com interações já captadas;
  - Amarelo “Aguardando interação” — @ válido, mas essa pessoa ainda não comentou;
  - Vermelho “Não rastreável” — Facebook cadastrado só por URL/@, que não casa com os dados da Meta.
- Botão **Adicionar pessoa** para quem ainda não existe no CRM (nome + telefone + @s), cadastrando 1 por 1 como você pediz.

### Etapa 3 — Resolver o Facebook do jeito que funciona

Como o @ do Facebook não serve de chave, a tela terá o vínculo assistido:

- Botão **“Vincular Facebook por comentário”** abre uma lista dos autores de Facebook que já comentaram e ainda não estão vinculados a ninguém (com nome e foto). Você clica no autor certo e ele é amarrado à pessoa — aí o ID interno correto é gravado e passa a contar todas as interações, passadas e futuras.
- Para quem ainda não comentou nenhuma vez, o registro fica “Aguardando primeira interação” e o vínculo pode ser feito no primeiro comentário, direto da página de Comentários (o botão de vincular já existe lá) ou por esta lista.
- Uma rotina de correspondência por nome sugere automaticamente candidatos prováveis (“Joaozinho Imbirussu” ≈ pessoa cadastrada), sempre exigindo sua confirmação — nunca vincula sozinho.

### Etapa 4 — Curtidas e compartilhamentos

Aqui preciso ser honesto sobre o que a Meta permite:

- **Facebook — curtidas/reações: possível.** Vou estender a coleta para buscar as reações dos posts da sua página e gravá-las em `engagement_actions` (tipo `like`/`reaction`), atribuídas pelo mesmo ID interno da Etapa 3. Depende das permissões do token da página, que valido antes de ligar.
- **Instagram — curtidas: não é possível.** A API do Instagram não expõe quem curtiu um post. Nenhum sistema honesto consegue isso; só comentários.
- **Compartilhamentos por pessoa: não é possível** em nenhuma das duas redes — a Meta só devolve o total, sem identificar quem compartilhou.
- Para cobrir esse ponto cego, a coluna de compartilhamento passa a usar o que já temos e é confiável: as **Missões do Portal** (link rastreável por pessoa/grupo), que registram quem abriu e quem declarou ter compartilhado. Assim você administra “compartilhou / não compartilhou” com dado real.

### Resultado final

Painel único por pessoa, somando Facebook + Instagram: comentários, curtidas (Facebook), respostas recebidas, sentimento, posts distintos, última interação e ranking — com filtro por categoria e por período, e a lista de quem está cadastrado mas **nunca** interage.

## Detalhes técnicos

- Migração: recriação idempotente de `supporters` a partir de `pessoas`/`funcionarios`/`supporter_accounts`; trigger `ensure_supporter_for_entity` reaproveitada; limpeza de `platform_user_id LIKE 'share_%'`.
- Frontend: nova aba em `src/pages/Engagement.tsx` + componente `PerfisTimeTab.tsx`; reuso de `extractHandleFromUrl` (`src/lib/social-url.ts`) e da lógica de vínculo de `AddToSupportersButton.tsx`.
- Vínculo por comentário: consulta `comments` distintos por `platform_user_id` do Facebook sem correspondência em `supporter_profiles`.
- Etapa 4: extensão de `supabase/functions/fetch-meta-comments` (edge `/reactions` dos posts) gravando `engagement_actions`, sem alterar o fluxo atual de comentários.
- Nada do fluxo de disparos/WhatsApp é tocado.
