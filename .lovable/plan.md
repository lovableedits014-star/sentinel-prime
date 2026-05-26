
# Plano: Central WhatsApp (unificação de Missões IA + Disparos + Status)

## Objetivo
Juntar três páginas que hoje estão em locais diferentes da sidebar em uma única central, mantendo 100% das funcionalidades atuais e apenas reorganizando navegação. Zero mudança de lógica, banco, edge functions ou componentes internos.

## Nome proposto
**"Central WhatsApp"** (rota `/whatsapp`), ícone `Send` ou `MessageSquare`.

Alternativas caso prefira: "WhatsApp Hub", "Campanhas WhatsApp", "Comunicação WhatsApp". Posso ajustar antes de implementar.

## Estrutura da nova página

Página única `src/pages/CentralWhatsApp.tsx` com `Tabs` no topo:

```
Central WhatsApp
├── 📤 Disparos          (conteúdo atual de Disparos.tsx → aba "disparos")
├── 🎂 Aniversários       (conteúdo atual de Disparos.tsx → aba "aniversario")
├── ✨ Missões IA         (AIMissionsPanel — Sugestões da IA)
├── 🎯 Missões Ativas     (PortalMissionsPanel — vinculado ao client)
└── 📡 Status WhatsApp    (conteúdo atual de StatusWhatsApp.tsx)
```

Hoje Disparos já tem 2 abas internas (Disparos / Aniversário) e Missões IA tem 2 abas internas (Sugestões / Missões Ativas). Vamos achatar tudo num único `TabsList` de 5 abas para o usuário ter um clique só.

## Arquivos afetados

**Criar:**
- `src/pages/CentralWhatsApp.tsx` — shell com header + Tabs renderizando os painéis existentes.

**Refatorar (extrair conteúdo para componentes reutilizáveis, sem mudar lógica):**
- `src/pages/Disparos.tsx` → extrair o miolo das duas abas para:
  - `src/components/whatsapp/DisparosPanel.tsx`
  - `src/components/whatsapp/AniversariosPanel.tsx` (apenas o `BirthdayConfigPanel` já existe — então pode ser direto).
- `src/pages/StatusWhatsApp.tsx` → extrair conteúdo para `src/components/whatsapp/StatusPanel.tsx`.
- `src/pages/MissoesIA.tsx` → já usa `AIMissionsPanel` e `PortalMissionsPanel`; só consumir os mesmos componentes na nova página.

**Editar:**
- `src/App.tsx` — adicionar rota `/whatsapp` apontando para `CentralWhatsApp`. Manter rotas antigas (`/disparos`, `/missoes-ia`, `/status-whatsapp`) como **redirects** para `/whatsapp?tab=disparos|missoes|status` para não quebrar links salvos / favoritos / código que aponta pra elas.
- `src/components/DashboardLayout.tsx` — remover os 3 itens (Missões IA, Disparos WhatsApp, Status WhatsApp) e adicionar **1 item** "Central WhatsApp" no grupo **Operacional**. Os grupos "Mobilização" e "Sistema" perdem esses itens (Sistema fica só com Configurações; Mobilização continua com Funcionários, Presença, Calendário).

## Comportamento da URL

- `/whatsapp` → abre na aba Disparos (default).
- `/whatsapp?tab=aniversarios|missoes-ia|missoes-ativas|status` → abre direto na aba.
- Acesso direto preservado via deep-link.

## Garantias (não muda nada além de organização)

- Nenhum hook, query, mutation, edge function, RLS, tabela ou tipo é alterado.
- `AIMissionsPanel`, `PortalMissionsPanel`, `SugestoesPanel`, `DispatchLogDialog`, `BirthdayConfigPanel`, `BordoesBairrosWidget` continuam exatamente iguais.
- `useWhatsAppGroups`, polling de instâncias, lógica de status, política de envio: intocados.
- `ContratadosDisparos` (`/contratados/disparos`) **não** entra nessa unificação — é fluxo separado de contratados.
- Permissões via `canAccess`: a nova rota `/whatsapp` herda permissão = união das três antigas (quem podia ver qualquer uma das três passa a ver a Central, mostrando só as abas permitidas).

## Detalhes técnicos

- A extração de Disparos.tsx (1369 linhas) é mecânica: mover o JSX dentro de `<TabsContent value="disparos">` para `DisparosPanel.tsx` levando junto seus `useState`/`useQuery`/handlers locais. Mesmas imports.
- Disparos.tsx e StatusWhatsApp.tsx originais ficam como **wrappers finos** (3-5 linhas) que apenas renderizam os novos painéis — assim qualquer import existente continua funcionando.
- MissoesIA.tsx vira wrapper igual.
- Controle de aba ativa via `useSearchParams` (`tab` query string) com fallback "disparos".

## Pontos para você decidir antes de eu implementar

1. **Nome da página**: "Central WhatsApp" serve? Outro?
2. **Em qual grupo da sidebar?** Sugiro **Operacional** (onde Disparos já estava). Alternativa: criar grupo novo "WhatsApp".
3. **Achatar para 5 abas** ou manter agrupamento (ex: aba "Missões" com sub-tabs internas)? Recomendo achatar para minimizar cliques, como você pediu.
4. **Manter rotas antigas como redirect** (recomendado) ou remover de vez?
