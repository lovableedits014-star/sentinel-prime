# Plano de Melhoria: Gestão de Funil e Reuniões (Eleição)

Este plano visa refinar a gestão de contatos na aba de Eleição, focando na identificação de quem está "comprometido" (participou da reunião) e facilitando a visualização por hierarquia e região.

## 1. Simplificação do Funil
Removeremos a redundância do estado "Pré-selecionado", consolidando a visualização em torno do compromisso real (participação na reunião).

- **O que muda**: A coluna e o status "Pré-selecionado" serão removidos.
- **Novo Foco**: O sistema focará em `Participou da Reunião` como o principal marco de engajamento antes da contratação.

## 2. Filtros Avançados e Segmentação
Implementação de filtros robustos para permitir uma gestão granular.

- **Filtro por Região**: Adição de seletor de região no topo da aba de Funil.
- **Filtro de Avulsos**: Opção para visualizar apenas líderes ou cabos que não possuem um coordenador vinculado (avulsos).
- **Filtro por Coordenador (Hierarquia)**: 
    - No Funil, será possível selecionar um Coordenador para ver apenas o time dele.
    - Isso permite cobrar o coordenador especificamente sobre a presença de seus liderados na reunião.

## 3. Interface de Gestão (FunnelManagement)
Reformulação da aba "Funil / Reunião" para ser uma central de comando.

- **Visualização em Duas Colunas**: 
    1. **Comprometidos (Reunião)**: Quem já validou a participação.
    2. **Em Prospecção (Pendente)**: Quem ainda precisa ser trazido para a reunião.
- **Contadores por Hierarquia**: Exibição de quantos membros do time de um coordenador já foram à reunião vs. total do time.

## 4. Melhorias Técnicas
- Atualização da tabela `eleicao_pessoas` (removendo/depreciando a coluna `pre_selecionado` no código).
- Otimização das queries de busca para suportar os novos filtros combinados (Coordenador + Região + Status).

## Detalhes Técnicos para Implementação

- **Arquivo `src/pages/Eleicao.tsx`**:
    - Adicionar `coordenadorFilter` e `avulsosOnly` ao estado.
    - Atualizar `FunnelManagement` props para receber esses novos filtros.
- **Arquivo `src/components/eleicao/FunnelManagement.tsx`**:
    - Remover lógica de `pre_selecionado`.
    - Atualizar colunas para "Comprometidos" e "Base".
    - Adicionar os seletores de filtro no topo do componente (ou integrá-los aos filtros globais da página).
- **Banco de Dados**: Não requer novas tabelas, apenas uso otimizado das colunas `participou_reuniao` e `parent_id`.

---
**INSTRUÇÃO**: Este é um plano de planejamento. Nenhuma alteração de código foi realizada ainda. Aguardo sua aprovação para prosseguir com a implementação.
