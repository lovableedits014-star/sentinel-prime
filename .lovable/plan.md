# Check-in de Missões por Link — cadastro rápido + dashboard de obrigados

Objetivo: você manda um link no grupo, a pessoa abre, faz um cadastro de 10 segundos (nome + WhatsApp), o sistema reconhece quem ela é na sua estrutura (coordenador / líder / cabo / voluntário / contratado) e passa a rastrear ela em todas as missões seguintes sem cadastro novo. Um dashboard mostra, missão por missão, quem cumpriu e quem não cumpriu — com foco nos **obrigados** (quem tem contrato gerado + voluntários).

## O que já existe hoje (aproveitado, não refeito)

- Página pública de missão `/missao/:missionId?d=<código do grupo>` com cadastro de nome + WhatsApp.
- Token salvo no celular da pessoa (reconhecimento automático no próximo link, por candidato).
- Registro de eventos: abriu, clicou no Facebook, clicou no Instagram, clicou no link avulso, "já realizei".
- Códigos por grupo (cada grupo recebe um código diferente no link) e relatório por missão.

## O que falta e será construído

### 1. Reconhecimento real da pessoa pelo telefone
Hoje o cadastro cria um "participante" solto: o telefone não é cruzado com a sua base. Vamos casar o telefone normalizado (padrão BR) contra, em ordem: estrutura eleitoral (`eleicao_pessoas`), contratados, funcionários e CRM.

Resultado na tela dela: "Olá, Maria — Líder / Região X". Resultado no seu dashboard: cada acesso já cai vinculado à pessoa certa, com cargo, região e quem a indicou.

Se o telefone não bater com ninguém, ela ainda participa, mas entra marcada como **Não identificado** numa fila para você vincular com 1 clique (ou ignorar).

### 2. Tela de cadastro rápido reformulada (a tela que ela abre)
- Passo 1: nome + WhatsApp (só isso). Máscara e validação BR, aceita `(67) 9...`, `067...`, com ou sem 55.
- Passo 2 (automático, sem digitar): "Reconhecemos você: **Líder — Campo Grande**". Se não reconhecer, pede confirmação do nome e segue.
- Passo 3: instruções da missão + botões Facebook / Instagram / link avulso + botão "Já realizei esta missão".
- Volta no próximo link: entra direto no Passo 3, sem formulário, com "Não é você? Trocar".
- Confirmação visual clara de que a participação foi registrada (a pessoa precisa sentir que contou).
- Convite para instalar o atalho no celular, para o token não se perder.

### 3. Geração e envio do link (a parte que você opera)
Nova aba **Check-in de missões**, com:
- Botão **Gerar link** para a missão: escolha "link único" (para qualquer grupo) ou "link por grupo" (um código para cada grupo, para saber de onde veio cada acesso).
- Lista dos links gerados com nome do grupo, botão copiar, QR code e mensagem pronta para colar no WhatsApp (com o texto da missão + link).
- Disparo direto para os grupos já cadastrados, reaproveitando a Central de WhatsApp.

### 4. Dashboard visual de cobrança (o coração do pedido)
Cabeçalho com placar da missão selecionada:
- Obrigados, Cumpriram, Abriram e não concluíram, Nunca abriram, % de adesão (barra de progresso).

Abaixo, três visões:
- **Por pessoa**: tabela com foto/inicial, nome, cargo (badge colorido), região, telefone, status da missão (✅ cumpriu / 👀 abriu / ⛔ não abriu), hora do check-in e botão de cobrança no WhatsApp já com texto pronto.
- **Por grupo/região/indicador**: ranking com barras — quem entrega e quem não entrega.
- **Histórico da pessoa**: últimas N missões em forma de trilha (✅/⛔ por missão), para ver reincidência.

Filtros: missão, período, cargo, região, indicador, "somente faltantes", "somente voluntários", "somente com contrato". Busca por nome/telefone.

Exportação em Excel e PDF respeitando os filtros (para cobrança presencial).

### 5. Definição de "obrigados"
Padrão: quem tem contrato gerado (valor de contratação definido) **mais** os voluntários. Alternável por chaves na própria tela (incluir cabos sem valor, incluir funcionários, incluir só uma região), para você medir do jeito que precisar.

### 6. Consistência (sem falhas)
- Bots do WhatsApp/Facebook que abrem o link para gerar preview não contam como acesso.
- Mesma pessoa em dois celulares = um único registro (casamento por telefone).
- Código de grupo inválido/expirado não trava a participação, só perde a origem.
- Telefone duplicado com formatações diferentes não gera pessoa repetida.
- Cargo muda depois (cabo → líder): o histórico continua ligado à pessoa.
- Nada disso depende de login: a página é pública, e o dashboard só é visível para a sua equipe.

## Detalhes técnicos

- Banco: `mission_participants` ganha vínculo forte (`pessoa_id`, `funcionario_id`, `contratado_id`, `match_source`, `match_confidence`) e índice por telefone normalizado; nova tabela `mission_checkins` (uma linha por missão × pessoa, com `primeiro_acesso`, `concluido_em`, `origem_distribuicao`) para leitura rápida do dashboard, alimentada por trigger a partir de `mission_events`.
- RPCs `SECURITY DEFINER` (a página é anônima): `public_mission_identify` passa a resolver a identidade e devolver cargo/região; novas `mission_checkin_dashboard(p_client_id, p_mission_id, filtros)`, `mission_checkin_pessoa_historico(p_pessoa_id)` e `mission_link_generate(p_mission_id, p_group)`.
- RLS: check-ins e participantes legíveis apenas por membros do `client_id`; escrita só via RPC definer. `GRANT` explícito para `authenticated`/`service_role` nas tabelas novas.
- Front: reformulação de `src/pages/MissaoPublica.tsx` (fluxo em 3 passos + reconhecimento), nova aba com `MissionCheckinDashboard.tsx`, `MissionLinksPanel.tsx` e `MissionPessoaHistorico.tsx` em `src/components/engagement/`, reaproveitando `toWhatsAppBR` de `src/lib/phone-utils.ts` e o padrão de exportação Excel/PDF já usado no Telemarketing.
- Rotas públicas existentes (`/api/public/missao/*`) mantidas e estendidas — nenhum link já enviado deixa de funcionar.

## Ordem de execução

1. Banco + reconhecimento por telefone (base de tudo).
2. Tela pública reformulada (cadastro rápido + reconhecimento + confirmação).
3. Geração de links por grupo + mensagem pronta/QR.
4. Dashboard visual + filtros + cobrança por WhatsApp.
5. Exportações Excel/PDF e histórico por pessoa.
