# Plano de Implementação: Postagens e Agendamento Meta

Este plano detalha a implementação das funcionalidades de upload de mídia, agendamento via calendário e pré-visualização em tempo real no painel de postagens Meta.

## Funcionalidades Principais

### 1. Upload de Mídia Local
- Integração com Supabase Storage (bucket `meta-media`).
- Suporte para Imagens (JPG, PNG) e Vídeos (MP4, MOV).
- Geração de URLs públicas para compatibilidade com a API do Meta.

### 2. Agendamento com Calendário
- Interface intuitiva usando `react-calendar`.
- Seleção de data e hora (fuso horário local, convertido para ISO para o servidor).
- Visualização de posts agendados em uma aba dedicada.

### 3. Seleção de Formato e Plataforma
- Opções para **Feed**, **Reels** e **Stories**.
- Publicação simultânea ou individual no Facebook e Instagram.
- Stories com suporte a vídeos de até 60 segundos.

### 4. Preview Dinâmico
- Visualização em tempo real do conteúdo (texto e mídia).
- Simulação de interface mobile/social.

## Detalhes Técnicos

### Backend (Server Functions)
- Atualização de `src/lib/meta.functions.ts` para processar `scheduledFor`.
- Lógica de persistência no banco de dados para posts agendados.

### Frontend
- Componente: `src/components/inteligencia-conteudo/MetaPostings.tsx`.
- Bibliotecas: `date-fns`, `react-calendar`, `lucide-react`.
- Estado: Gerenciamento complexo de formulário com `useState` e `react-query`.

### Banco de Dados
- Tabela `meta_scheduled_posts` (já provisionada).
- Bucket `meta-media` (configurado como público).

## Passos de Execução

1.  **Refinar UI do Editor**: Adicionar seletor de formato e botão de upload.
2.  **Implementar Upload**: Lógica para enviar arquivo ao Supabase e atualizar a URL de mídia.
3.  **Adicionar Calendário**: Modal ou seção lateral para escolha de data/hora.
4.  **Ajustar Preview**: Lógica para renderizar `<video>` ou `<img>` baseado no arquivo selecionado.
5.  **Finalizar Agendamento**: Conectar o formulário à server function com o timestamp correto.
