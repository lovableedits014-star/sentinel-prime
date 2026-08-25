# Missões: links externos manuais + dashboard de cobrança elaborado

O fluxo atual (gerar link, jogar no grupo, pessoa se cadastra e fica rastreada) permanece exatamente como está. Duas frentes novas.

## 1. Links externos manuais (quantos quiser)

Hoje a missão só aceita uma publicação do Facebook e/ou do Instagram (e um único "link avulso"). Vai passar a aceitar uma lista livre de links.

- No diálogo **Nova missão** (e ao editar a missão), uma nova seção **Links da missão**: campo de rótulo + URL, botão "Adicionar link", lista com reordenar e remover. Sem limite de quantidade.
- Cada link pode ser de qualquer origem (site, notícia, YouTube, TikTok, WhatsApp, Google Forms, etc.). O ícone é escolhido automaticamente pela URL; quando não reconhecido, entra como link genérico.
- Passa a ser possível criar missão **sem nenhuma publicação da Meta** — basta ter ao menos um link manual.
- Na tela pública da missão, os links aparecem como botões na mesma ordem cadastrada, cada um com clique registrado individualmente (dá para ver qual link a pessoa abriu).
- Os links atuais (Facebook / Instagram / avulso) continuam funcionando; nenhum link já enviado ao grupo quebra.

## 2. Dashboard elaborado de check-in

Reformulação da área de dashboard da aba **Check-in de missões**, com três blocos.

### Placar e gráficos
- Cartões: Obrigados, Cumpriram, Abriram e não concluíram, Nunca abriram, % de adesão.
- **Rosca de status** (cumpriu / abriu / não abriu).
- **Barras de adesão por cargo** (coordenador, líder, cabo, voluntário, funcionário) e **por região**.
- **Linha do tempo de entrada no link** por hora/dia — mostra quando as pessoas realmente acessam (útil para escolher o horário de disparo).
- **Evolução entre missões**: adesão das últimas missões, para ver se o time está melhorando ou caindo.

### Alertas dos ruins
Painel de destaque no topo, gerado automaticamente:
- **Reincidentes**: quem não cumpriu as últimas N missões seguidas (N ajustável).
- **Nunca entrou em nenhum link**: obrigados que nunca apareceram.
- **Sem cadastro/sem telefone válido**: quem não pode nem ser cobrado (leva ao painel de pendências).
- **Não identificados**: quem entrou pelo link mas o telefone não casou com ninguém da base — fila com botão de vincular.
- **Regiões e indicadores abaixo da meta** de adesão (meta configurável, padrão 70%).
- Cada alerta tem ação: cobrar no WhatsApp (individual ou em lote, gerando mensagens uma a uma) e exportar a lista.

### Filtros
Barra de filtros aplicada a tudo (cartões, gráficos, tabela e exportações):
- **Status de entrada**: entrou / não entrou / cumpriu / só abriu.
- **Cadastro**: com cadastro no sistema / não identificado.
- **Obrigatoriedade**: somente voluntários · somente com contrato gerado · voluntários + contrato (padrão, os obrigatórios) · todos.
- Cargo, região/cidade, indicador, período, busca por nome/telefone.
- Chaves atuais (incluir sem valor de contrato, incluir funcionários, somente faltantes) mantidas.
- Presets de um clique: "Obrigatórios faltantes", "Voluntários faltantes", "Contratados faltantes", "Não identificados".

Tabela por pessoa ganha colunas de contrato/voluntário, quantos links clicou, quais links abriu e histórico resumido das últimas missões (trilha ✅/⛔). Exportação Excel e PDF respeitando os filtros.

## Detalhes técnicos

- Banco: nova tabela `portal_mission_links` (`mission_id`, `client_id`, `label`, `url`, `kind`, `display_order`), com GRANTs e RLS por `client_id`; `mission_events` ganha `mission_link_id` para atribuir o clique ao link certo (o enum `mission_event_type` recebe `click_link`). `public_mission_config` passa a devolver o array de links; `public_mission_event` aceita o `link_id`.
- `mission_checkin_dashboard` estendida: filtros de obrigatoriedade/status/indicador, contagem de cliques por link e flag `tem_cadastro`. Novas RPCs `mission_checkin_series(p_client_id, p_mission_id)` (série horária), `mission_checkin_alertas(p_client_id, p_mission_id, p_janela int, p_meta int)` e `mission_participantes_nao_identificados(p_client_id, p_mission_id)`. Todas `SECURITY DEFINER` com `is_client_member`.
- Front: `MissionFromPostDialog.tsx` ganha o editor de links (e deixa de exigir publicação Meta); `MissaoPublica.tsx` renderiza a lista dinâmica de botões; `MissionCheckinDashboard.tsx` é dividido em `MissionCheckinFilters.tsx`, `MissionCheckinCharts.tsx` (recharts, já instalado) e `MissionCheckinAlerts.tsx`, mantendo a tabela e as exportações XLSX/jsPDF existentes.

## Ordem de execução

1. Banco (tabela de links, evento por link, RPCs novas).
2. Editor de links manuais + tela pública com botões dinâmicos.
3. Filtros e presets do dashboard.
4. Gráficos e painel de alertas.
5. Exportações e histórico por pessoa ajustados aos novos filtros.
