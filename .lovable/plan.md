# Confirmação de Presença em Reuniões (RSVP por link público)

Objetivo: criar reuniões com sessões (manhã/tarde), cada uma com vagas configuráveis, gerar um link público por reunião/grupo e deixar as pessoas se inscreverem escolhendo o horário — com controle automático de lotação.

## 1. Criar reunião (painel interno)

Nova aba "Reuniões" dentro de Eleição, com:
- Título, data, local, observações.
- Sessões ilimitadas (padrão: Manhã e Tarde), cada uma com hora de início/fim e nº de vagas (ex.: 20 e 20) — editável a qualquer momento.
- Vários links por reunião: cada link tem um rótulo (ex.: "Grupo Coordenadores Zona 3") para saber de qual grupo veio cada inscrição.
- Botão para copiar link e mensagem pronta para colar no WhatsApp.

## 2. Formulário público

Rota `/reuniao/:token`:
- Nome completo + WhatsApp (telefone é essencial para cobrança/lembrete; normalizado no padrão brasileiro já usado no sistema).
- Escolha do horário mostrando vagas restantes em tempo real; sessão cheia aparece como "Lotado" e não é selecionável.
- Tela de confirmação com data, horário e local; opção de trocar de horário reabrindo o mesmo link com o mesmo telefone.
- Bloqueio de inscrição duplicada pelo mesmo telefone na mesma reunião.

## 3. Gestão e presença no dia

- Lista de inscritos por sessão, com origem (link/grupo) e horário da inscrição.
- Check-in no dia: marcar "Compareceu" / "Faltou" — integrado ao funil já existente (`participou_reuniao`), então quem faz check-in entra automaticamente em "Comprometidos".
- Vinculação automática ao cadastro de Eleição quando o telefone já existir na base (mostra cargo, coordenador e região do inscrito).
- Contadores: vagas ocupadas/restantes, taxa de comparecimento, faltas por coordenador.
- Exportação Excel/PDF da lista de inscritos e do relatório de presença (mesmo padrão dos outros relatórios).

## 4. Melhorias sugeridas

- **Lista de espera**: quando a sessão lota, o inscrito entra em espera e é promovido automaticamente se alguém cancelar.
- **Fechamento automático**: encerrar inscrições em data/hora definida ou ao lotar tudo.
- **Lembrete no WhatsApp**: disparo em massa para os inscritos (véspera e manhã do dia) usando a Central WhatsApp já existente.
- **QR Code do link** para projetar/imprimir, e QR de check-in na porta.
- **Cobrança de ausentes**: um clique gera a lista de quem se inscreveu e não compareceu para disparo/cobrança pelo coordenador.

## Detalhes técnicos

- Tabelas novas: `reunioes` (client_id, título, data, local, status, encerra_em), `reuniao_sessoes` (reuniao_id, label, início, fim, vagas), `reuniao_links` (token único, label do grupo, ativo), `reuniao_inscricoes` (sessão, nome, telefone normalizado, link de origem, eleicao_pessoa_id opcional, status: confirmado/espera/cancelado, presença + horário do check-in). GRANTs + RLS: escrita/leitura restrita ao cliente autenticado; o público não acessa as tabelas diretamente.
- Acesso público via RPCs `security definer` por token (padrão já usado em indicações/missões): uma para ler config + vagas restantes, outra para inscrever com verificação transacional de lotação (evita estouro em cliques simultâneos) e entrada em lista de espera.
- Front: `src/pages/ReuniaoPublica.tsx` + rota pública em `App.tsx`; painel em `src/components/eleicao/ReunioesPanel.tsx` com dialogs de criação, links e check-in. Telefone via `toWhatsAppBR` de `src/lib/phone-utils.ts`; check-in grava também `participou_reuniao`/`reuniao_em` em `eleicao_pessoas` quando houver vínculo.
