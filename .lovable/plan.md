## O que vamos entregar

Hoje a função "Gerar minha foto" (moldura/frame da campanha) já existe e está plugada no portal do Apoiador, do Funcionário e do Contratado, via componente `CampaignFrameGenerator`. Ela carrega as molduras ativas do cliente por uma RPC pública (`get_active_campaign_frames`) e gera a foto no próprio navegador. **Não existe hoje uma página pública dedicada** — o gerador só aparece dentro de portais logados.

Vamos:

1. **Criar uma página pública** `/foto/:clientId` (sem login) que mostra o gerador de foto da campanha daquele candidato. Esse vira o "link do template da foto do WhatsApp" que o coordenador pode mandar pra qualquer pessoa.
2. **Adicionar o gerador no Portal do Coordenador** (mesma experiência dos outros portais).
3. **Botão "Copiar link da foto"** no topo do portal do coordenador (copia `https://.../foto/{clientId}` pro clipboard).
4. **Botão "Enviar foto" em cada linha de líder e cabo** — abre o WhatsApp (`wa.me/<telefone>`) já com mensagem pronta convidando a pessoa a gerar a foto naquele link.

## Detalhes técnicos

- **Nova rota pública** `src/pages/FotoPublica.tsx` registrada em `src/App.tsx` (sem guarda de auth, igual aos cadastros públicos). Layout enxuto: header com logo do candidato, `<CampaignFrameGenerator clientId={clientId} variant="showcase" />`, rodapé curto. Trata `clientId` inválido com mensagem amigável.
- **`CampaignFrameGenerator`** já usa `supabase.rpc("get_active_campaign_frames", ...)`. Vou verificar/garantir que essa RPC seja `SECURITY DEFINER` e acessível para `anon` (caso ainda não esteja, criamos migration ajustando o `GRANT EXECUTE ... TO anon`). O componente em si não exige sessão.
- **Portal do Coordenador (`src/pages/PortalCoordenador.tsx`)**:
  - Importar `CampaignFrameGenerator` e renderizar no topo (`variant="showcase"`).
  - Botão **"Copiar link da foto"** ao lado dos botões existentes; usa `navigator.clipboard.writeText` + toast.
  - Em `PessoaRow` (líderes e cabos), adicionar botão "Enviar foto" que abre `https://wa.me/<digitos do telefone>?text=<mensagem url-encoded>` em nova aba. Mensagem padrão:
    `"Oi {nome}! Gere sua foto de perfil oficial da campanha aqui: {link}"`.
  - Normalizar telefone removendo não-dígitos e prefixando `55` quando faltar.
- **Sem mudanças no banco** além do possível `GRANT EXECUTE` na RPC se ela ainda não permitir `anon` — confirmamos antes de criar migration.

## Fluxo final pro coordenador

```text
Portal do Coordenador
 ├── [Mostra gerador da foto] (mesma experiência do apoiador)
 ├── [Botão "Copiar link da foto"]  →  https://app/foto/{clientId}
 └── Lista de Líderes / Cabos
      └── cada linha: [Senha] [Excluir] [Enviar foto] → abre WhatsApp
```

Qualquer pessoa que receber o link `/foto/{clientId}` consegue gerar a foto sem precisar logar.