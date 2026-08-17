# Plano de Implementação: Gestão de Status de Contratação (Pré-seleção vs. Efetivação)

Este plano visa introduzir um fluxo de funil para os contatos de Eleição, permitindo diferenciar quem é apenas um "candidato/indicado" de quem já participou da reunião e "fechou" (contratado).

## 1. Banco de Dados (Supabase)
*   **Nova Coluna**: Adicionar `status_contratacao` na tabela `eleicao_pessoas` (ou `status_funil`).
*   **Valores do Status**:
    *   `pendente`: (Padrão) Apenas cadastrado no sistema.
    *   `em_negociacao`: Reunião agendada ou em andamento.
    *   `confirmado`: Pessoas que "já fecharam" (foram à reunião e estão conosco).
*   **Nova Coluna de Data**: `confirmado_em` para registrar quando o acordo foi fechado.
*   **Migração SQL**: Criar a coluna e índices para busca rápida por status.

## 2. Interface de Usuário (Frontend)
### Aba de Eleição / Funil de Contratação
*   **Novos Filtros**: Adicionar seletores para filtrar a lista principal por `Pendente`, `Em Negociação` e `Confirmado`.
*   **Ações em Massa**: Permitir selecionar várias pessoas e marcá-las como "Confirmado" de uma vez (ideal para processar listas de reuniões).
*   **Indicadores Visuais**:
    *   Badge verde para "Confirmado".
    *   Badge cinza/amarelo para "Pendente".

### Painel "Pendentes de Valor" & "Previsão de Custos"
*   **Refinamento de Custos**: Adicionar opção para ver a previsão de custos apenas dos "Confirmados" (custo real) vs. "Pendentes" (custo potencial).
*   **Destaque no Card**: Exibir o percentual de conversão (Quantas pessoas fecharam vs. Total cadastrado).

## 3. Integrações e Lógica
*   **Geração de Contratos**: Opção de gerar contratos apenas para quem está com status `confirmado`.
*   **Importação de Excel**: Atualizar o importador para que, se uma planilha for subida, o usuário possa definir que todos aqueles contatos já entram como `confirmados`.

## 4. Próximos Passos (Fluxo Técnico)
1.  Executar migração SQL para adicionar `status_contratacao`.
2.  Atualizar o componente `Eleicao.tsx` para incluir os filtros e badges.
3.  Criar um diálogo de "Ações em Lote" para mudança de status.
4.  Ajustar os relatórios de custos para considerar o novo status.

---
**Você aprova este plano para prosseguirmos com a implementação técnica?**
