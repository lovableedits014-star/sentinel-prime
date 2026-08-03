# Migração de VPS — diagnóstico e plano

Resposta curta: **sim, é simples** no seu caso. Praticamente tudo que é "estado" (banco, arquivos, funções, cron) vive fora da VPS, no Supabase. A VPS só roda o site (build Node em Docker). Não é "só apontar o domínio", mas a lista de coisas a ajustar é curta e previsível.

## O que analisei (estado atual)

- O deploy é um **Docker de 2 estágios** (`Dockerfile`) que compila o app e roda `server-entry.mjs` (Node, porta 3000). Serve tanto o SSR quanto os arquivos estáticos — não depende de Nginx/Apache específico da VPS.
- **Nenhum domínio da sua VPS está escrito no código.** Busquei em `src/` e `supabase/functions/` e só existem domínios externos (Facebook, IBGE, TSE, etc.).
- **Banco, Auth, Storage e Edge Functions estão no Supabase** (`xvlvlhwlatclucjzwhld`). Nada disso muda de lugar.
- Os **cron jobs** que chamam o app usam a URL estável `project--<id>.lovable.app`, não a VPS. Continuam funcionando sem tocar em nada.
- O **bridge do WhatsApp** aponta para um projeto Supabase externo (`vxqvrsaxppbgxookyimz...`), ou seja, não roda dentro da sua VPS.
- `clients.public_base_url` está **vazio** hoje (links públicos usam a origem do navegador) — ponto a preencher com o domínio final depois da migração.

Conclusão: não há dados nem serviços "presos" à VPS atual. É um container stateless.

## Onde estão as (poucas) dores de cabeça

1. **Variáveis de ambiente.** Precisa recriar no novo host: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` (build) e `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (runtime). Esquecer a service role key é a falha nº 1 — quebra missões públicas e rotas de servidor.
2. **URLs de redirect no Supabase Auth.** Site URL + allowlist precisam conter o domínio novo, senão login/reset de senha voltam para o lugar errado.
3. **Chave do Google Maps** (`VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY`) costuma ter restrição por domínio — adicionar o domínio novo.
4. **Service worker / PWA** (`public/sw.js`, `manifest.webmanifest`): quem já instalou o app na tela inicial pode ficar com cache antigo. Resolve-se com bump de versão do cache.
5. **DNS e SSL**: propagação (até algumas horas) e emissão do certificado no novo host.
6. **Janela de indisponibilidade**: dá para deixar quase zero se você subir o app novo *antes* de mexer no DNS.

## Plano de migração (ordem recomendada)

1. **Escolher o destino.** Três opções, do mais simples ao mais barato:
   - Publicar direto pelo Lovable (sem VPS): já existe URL estável e SSL automático — zero manutenção.
   - VPS nova com Easypanel/Coolify/Dokploy: mesmo fluxo que você já usa hoje, Dockerfile já pronto.
   - Plataforma gerenciada (Railway/Render/Fly): deploy via GitHub, sem administrar servidor.
2. **Conectar o GitHub** no novo host e apontar para o repositório do projeto (build via `Dockerfile`, porta 3000).
3. **Cadastrar as variáveis de ambiente** listadas acima antes do primeiro build.
4. **Fazer o primeiro deploy e testar pela URL temporária do host** (ainda sem tocar no DNS): login, dashboard, envio de WhatsApp, missão pública, upload de foto.
5. **Apontar o DNS** do domínio para o novo host e aguardar o SSL.
6. **Atualizar as allowlists**: Supabase Auth (Site URL + Redirect URLs), chave do Google Maps e, se usar login social, os redirect URIs do provedor.
7. **Preencher `public_base_url`** nas Configurações do cliente com o domínio definitivo, para os links de missão/galeria enviados por WhatsApp saírem corretos.
8. **Bump do cache do service worker** e teste em celular (PWA instalado).
9. **Só então desligar a VPS antiga**, depois de 48h de funcionamento estável.

## Detalhes técnicos

- O `Dockerfile` hoje embute as três variáveis `VITE_SUPABASE_*` como `ENV` fixas no estágio de build. Funciona, mas vale trocar por `ARG`/env do host para não ter valor duplicado em dois lugares.
- O install usa `npm install --legacy-peer-deps` e Node 22 — qualquer host com Docker atende; não precisa de Bun em produção.
- `server-entry.mjs` lê `PORT`/`HOST` do ambiente; se o host novo exigir outra porta, basta a variável.
- Nada de arquivos gravados em disco pela aplicação (uploads vão para o Storage do Supabase), então **não há volume a migrar**.
- Um ponto a confirmar antes de desligar a máquina antiga: se você (ou alguém) instalou **qualquer serviço extra dentro dessa VPS** (bridge de WhatsApp próprio, n8n, cron do sistema, banco local). Pelo código, nada disso é usado — mas se existir algo instalado à parte, precisa ser migrado separadamente.

## Riscos e mitigação

| Risco | Mitigação |
| --- | --- |
| Login quebrado após trocar domínio | Atualizar Auth URLs no mesmo dia do DNS |
| Missões/rotas de servidor com erro 500 | Conferir `SUPABASE_SERVICE_ROLE_KEY` no runtime |
| Mapa em branco | Liberar domínio novo na chave do Google Maps |
| PWA antigo servindo tela velha | Bump da versão do cache no `sw.js` |
| Indisponibilidade | Testar na URL temporária antes de mexer no DNS |
