# Plano de Implementação: Gestão de Funil de Contratação e Reuniões

Este plano detalha as melhorias no sistema de Eleição para permitir a gestão visual do status de contratação, marcação de presença em reuniões e visualização de pessoas "pré-selecionadas".

## 1. Banco de Dados (Refinamento)
*   **Campos existentes**: Já temos `status_contratacao` e `confirmado_em`.
*   **Novos campos**:
    *   `participou_reuniao`: boolean para marcar quem compareceu fisicamente.
    *   `reuniao_em`: timestamp de quando a presença foi marcada.
    *   `pre_selecionado`: boolean para indicar interesse imediato antes da confirmação final.
*   **Migração SQL**: Adicionar as colunas à tabela `eleicao_pessoas` com os respectivos índices.

## 2. Interface de Gestão (src/pages/Eleicao.tsx)
*   **Edição Acessível**: Garantir que o seletor de status e as novas flags (Reunião/Pré-selecionado) estejam disponíveis no `Dialog` de edição (que o usuário sentiu falta).
*   **Ações Rápidas na Lista**:
    *   Adicionar botões de "check" rápido na linha de cada pessoa para marcar presença em reunião ou pré-seleção sem abrir o diálogo de edição.
    *   Implementar ações em massa (bulk actions) para marcar vários contatos como "Participou da Reunião" de uma vez.

## 3. Nova Aba: Funil de Contratação / Gestão de Reunião
*   **Nova Tab "Funil"**: Criar uma aba dedicada que agrupa os contatos por status:
    *   **Participantes de Reunião**: Lista prioritária de quem já teve contato físico.
    *   **Pré-selecionados**: Quem está aguardando apenas o "ok" final.
    *   **Pendentes**: Quem ainda não compareceu ou não foi contatado.
*   **Visualização Estilo Kanban ou Listas Segmentadas**: Facilitar a identificação de quem está "mais próximo" da campanha.

## 4. Filtros e Relatórios
*   **Filtro Global**: Adicionar filtros na aba principal para "Apenas Reunião" e "Apenas Pré-selecionados".
*   **Contadores**: Exibir no topo da página o resumo (Ex: 50 Confirmados, 20 em Reunião, 100 Pendentes).

## Detalhes Técnicos
*   Atualizar o `form` e o `Pessoa` interface em `Eleicao.tsx`.
*   Ajustar o `save()` para persistir os novos estados.
*   Criar um componente de "StatusBadge" mais interativo para troca rápida de estado.

---
**Aguardando aprovação para iniciar a codificação.**
