# Plano de Melhoria: Relatórios do Funil de Reunião

Este plano detalha a implementação de ferramentas de exportação e relatórios específicos para o funil de reunião, permitindo que a coordenação visualize e compartilhe o status de comprometimento do time de forma profissional.

## 1. Novos Recursos de Exportação

### Relatório de Presença (PDF)
- **Lista de Comprometidos**: Relatório limpo focado apenas em quem já participou da reunião.
- **Lista de Prospecção**: Relatório de pendências para cobrança, organizado por coordenador e região.
- **Resumo por Coordenador**: Tabela comparativa mostrando a taxa de conversão (Time total vs. Presentes na reunião) por equipe.

### Exportação Customizada no Funil
- Adição de um botão "Exportar Funil" diretamente na aba de Funil/Reunião.
- Filtros inteligentes aplicados automaticamente baseados na visão atual do usuário.

## 2. Indicadores Visuais (Analytics)
- **Taxa de Comprometimento**: Gráfico de rosca ou barra de progresso mostrando a porcentagem do time total que já passou pela reunião.
- **Top Coordenadores**: Destaque para as equipes com maior engajamento físico.

## Detalhes Técnicos

### Backend & Libs
- Utilização da biblioteca `jspdf` e `jspdf-autotable` já integradas ao projeto.
- Atualização da função `exportEleicaoPdf` para suportar o novo flag `statusReuniao`.
- Criação de uma nova função `exportFunnelAnalytics` em `src/lib/eleicao-export-pdf.ts`.

### Interface (UI)
- **Componente `FunnelManagement.tsx`**: Inclusão de botões de ação rápida para exportar a visão de "Comprometidos" e "Prospecção".
- **Componente `ExportEleicaoDialog.tsx`**: Adição de uma nova opção de filtro: "Somente quem participou da reunião".

## Próximos Passos
1. Modificar a biblioteca de exportação para incluir campos de data de reunião e status.
2. Adicionar os botões de exportação na interface do Funil.
3. Testar a geração de PDFs com grandes volumes de dados.

<!-- eu gostaria de conseguir exportar tbm relatorios pertinentes ao funil de reunião!  faça um planejamento completo em relação a isso -->
