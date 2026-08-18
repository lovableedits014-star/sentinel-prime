---
name: Unificação Hierárquica e Mobilidade de Cargos em Eleição
description: Flexibilizar vínculos (Coordenador -> Cabo), permitir Cabos avulsos e implementar sistema de promoção/rebaixamento com gestão de impacto na árvore.
type: feature
---

## Objetivos
1. **Hierarquia Flexível:** Permitir que Coordenadores tenham Cabos Eleitorais diretos e que Cabos possam ser "Avulsos" (sem superior).
2. **Mobilidade de Cargos:** Facilitar a mudança de cargo (ex: Líder -> Coordenador) mantendo ou reestruturando subordinados.
3. **Integridade de Dados:** Garantir que a lógica de "pai" (parent_id) funcione para qualquer combinação permitida.

## 1. Banco de Dados e Lógica de Negócio
- Nenhuma alteração de schema necessária na tabela `eleicao_pessoas` (ela já suporta `parent_id` genérico e `tipo`).
- A lógica de propagação de escopo (região/cidade) já existe via trigger e deve ser verificada para garantir que cobre novos caminhos (ex: Coordenador -> Cabo).

## 2. Interface de Cadastro e Edição (NovaPessoaDialog)
- **Vínculos Dinâmicos:** 
  - Se Tipo = Líder, permitir selecionar Coordenador (ou Avulso).
  - Se Tipo = Cabo, permitir selecionar Líder OU Coordenador (ou Avulso).
  - Listar superiores compatíveis no seletor `parent_id`.
- **Mudança de Cargo (Impacto):**
  - Ao mudar o cargo de alguém que possui subordinados, implementar lógica de "Herança":
    - Se a mudança for compatível (ex: Coord -> Líder), mantém os subordinados vinculados ao mesmo ID.
    - Se incompatível (ex: Líder -> Cabo), perguntar se os subordinados devem ser migrados para o novo superior do rebaixado ou tornados Avulsos.

## 3. Gestão de Funil (FunnelManagement)
- Ajustar filtros para exibir "Cabos do Coordenador" (vínculo direto).
- Garantir que a contagem de "Comprometidos" e "Prospecção" inclua todos os níveis da árvore.

## 4. Fluxo de Notificação e WhatsApp
- Atualizar `resolverFluxoCadastro` para suportar Cabos vinculados diretamente a Coordenadores (enviar notificação para o Coordenador correto).
- Ajustar templates de boas-vindas para refletir o cargo e o superior correto.

## Detalhes Técnicos
- **Arquivos afetados:**
  - `src/pages/Eleicao.tsx`: Lógica de salvamento e filtros.
  - `src/components/eleicao/FunnelManagement.tsx`: Lógica de agrupamento e estatísticas.
  - `src/lib/eleicao-fluxo-cadastro.ts`: Resolução de superior para notificações.
  - `src/components/pessoas/NovaPessoaDialog.tsx`: Formulário de criação/edição.
