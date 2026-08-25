# Reformulação da aba Engajamento — monitorar um público que eu cadastro na mão

## O que eu medi no seu banco agora

- **646 obrigações geradas e 100% delas em "não cumprida"**. O motivo é objetivo: **641 das 646 não têm nem @ do Instagram nem perfil do Facebook**. Sem rede cadastrada não existe comprovação possível, então todo mundo aparece como devedor. É por isso que a aba parece vaga.
- **Só 3 pessoas** estão marcadas no público monitorado e **nenhum grupo** foi criado — a tela onde isso se faz está escondida como sub-aba dentro de Monitoramento.
- Redes cadastradas hoje: **35 Instagram + 27 Facebook**, contra **3.309 autores distintos** de comentários já capturados (9.905 comentários). Ou seja: a matéria-prima de comprovação existe, o que falta é o cadastro do @ da pessoa.
- Só existe **1 regra** ativa (coordenadores/líderes, modo automático) e **1 publicação monitorada**.

Conclusão: o módulo foi construído em torno do público automático por cargo. Você quer o contrário — uma lista curta e explícita de pessoas, com as redes cadastradas por você, e cobrança só sobre elas.

## Nova estrutura da aba (substitui as abas atuais)

```text
Engajamento
├── 1. Público monitorado   (tela principal: pessoas + @ + telefone)
├── 2. Publicações          (o que está sendo cobrado e adesão de cada post)
├── 3. Cobrança             (ranking, quem faltou, WhatsApp, PDF/Excel)
└── 4. Config               (regras, prazos, pontuação)
```

- **Influenciadores** e **Perfis do Time** deixam de ser abas de topo: o ranking geral de quem mais interage vira um bloco dentro de Cobrança, e a busca/cadastro de perfis passa a viver dentro do Público monitorado (é o mesmo trabalho).
- Nada é apagado do banco; é reorganização de tela mais as funções novas abaixo.

## 1. Público monitorado (o coração)

- **Uma lista só, sua, explícita.** Cada pessoa entra por marcação — nada de "público por cargo" decidindo por você.
- **Duas formas de adicionar:**
  1. **Buscar nos cadastros** (Eleição, Contratados, Funcionários, Pessoas, portal) por nome ou telefone e marcar.
  2. **Cadastrar pessoa solta**: nome + telefone + @ do Instagram + perfil do Facebook, sem precisar existir em nenhum outro cadastro. Fica gravada como pessoa do monitoramento e pode depois ser promovida a apoiador/contratado se você quiser.
- **Cadastro das redes na própria linha**, sem abrir diálogo: campo de @ do Instagram, campo de URL/perfil do Facebook, campo de telefone (normalizado no padrão brasileiro).
- **Modo cadastro em série**: salvar e cair direto no próximo campo, mostrando quantas interações passadas foram reaproveitadas ao vincular o @ (o histórico de comentários é reprocessado retroativamente).
- **Sugestões de vínculo** por pessoa: lista os autores de comentários já capturados com nome parecido, com foto e nº de comentários, para amarrar em um clique — é o único caminho confiável no Facebook.
- **Semáforo de prontidão por linha**: `Pronta para cobrança` (tem @ ou perfil vinculado), `Só telefone` (dá para cobrar clique no link, não comentário), `Sem dados` (não pode ser cobrada — fica fora dos índices em vez de aparecer como devedora).
- **Grupos** (opcional): "Coordenadores da Capital", "Time do interior" etc., para cobrar públicos diferentes em publicações diferentes.
- Exportação da lista e das pendências em Excel para cobrar dados pessoalmente.

## 2. Publicações

- Escolher a publicação (feed/reels/story do Facebook e Instagram já cadastrados) e apontar **qual lista/grupo é obrigado**.
- Antes de gerar as obrigações, a tela mostra: **X pessoas no público, Y prontas para cobrança, Z sem dados** — e só gera obrigação para quem tem meio de comprovação, evitando de vez o cenário atual de 641 falsas faltas.
- Tipos de cobrança conforme você definiu:
  - **Comentar** — comprovado automaticamente pela API, casando o autor do comentário com o @ vinculado.
  - **Clicar no link da missão** — comprovado pelo link individual rastreado enviado no WhatsApp.
- Adesão por publicação: cumpriram, faltaram, no prazo/atrasado, com botão de recasar interações a qualquer momento.

## 3. Cobrança

- Ranking do público monitorado por índice, com faixa (Excelente / Atenção / Baixo / Crítico) e variação em relação ao período anterior.
- Lista **"Faltou"** por publicação e no acumulado, com telefone e botão de WhatsApp com mensagem pronta; cada cobrança fica registrada.
- **Pessoas sem dados aparecem em um bloco separado** ("falha de cadastro"), nunca misturadas com quem não interagiu.
- Exportação **PDF e Excel** agrupada por grupo/região e nome, no mesmo padrão dos seus relatórios de Eleição, mais PDF individual por pessoa.

## 4. Config

- Regras: tipo de cobrança, quantidade esperada, prazo em horas, e a lista/grupo alvo (o modo "automático por cargo" continua disponível, mas deixa de ser o padrão).
- Pontuação por ação e dias de inatividade, como hoje.

## Ordem de execução

1. Público monitorado com pessoas soltas + cadastro de redes na linha + sugestões.
2. Publicações com prévia do público e geração só de quem é comprovável.
3. Cobrança (ranking, faltas, WhatsApp, PDF/Excel).
4. Limpeza da estrutura de abas e da regra automática legada.

## Detalhes técnicos

- `engagement_publico` ganha suporte a **pessoa solta**: `origem = 'manual'`, com `nome`, `telefone`, e as redes gravadas via `engagement_entity_upsert_social` usando um apoiador criado sob demanda (`ensure_supporter_for_entity`), preservando o vínculo com `supporter_profiles` e o recasamento de `comments`.
- `engagement_publico_pendencias` estendida com `pronta_para_cobranca` e `motivo_bloqueio`; `engagement_publico_alvo` passa a marcar (não excluir) quem está sem meio de prova.
- `engagement_gerar_obrigacoes` deixa de criar obrigação para pessoa sem `instagram_handle`/`facebook_key` quando o tipo for `comentar`, e sem telefone quando o tipo for clique de link; contabiliza os bloqueados em um retorno próprio para a prévia na tela.
- Limpeza pontual das 641 obrigações inválidas já existentes (marcadas como `dispensada` com justificativa "sem meio de comprovação"), para o painel refletir a realidade.
- Reuso de `engagement_unlinked_authors` + `src/lib/engagement-match.ts` nas sugestões, `toWhatsAppBR` de `src/lib/phone-utils.ts` na normalização, e `jspdf`/`jspdf-autotable` (padrão de `src/lib/eleicao-export-pdf.ts`) nos relatórios.
- Frontend: `src/pages/Engagement.tsx` reorganizado em 4 abas; `PublicoMonitoradoTab.tsx` reescrito com edição inline e cadastro manual; `MonitoramentoTab.tsx` dividido em `PublicacoesTab.tsx` e `CobrancaMonitorTab.tsx`; `InfluenciadoresTab`/`PerfisTimeTab` passam a blocos internos.
- Nada dos módulos de disparo/WhatsApp, telemarketing, missões públicas ou postagens Meta é alterado.
