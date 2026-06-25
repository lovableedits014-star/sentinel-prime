## Objetivo

Fazer a exportação/importação de contatos funcionar de forma confiável no iPhone, mesmo quando o Safari/iOS não oferece “Salvar em Arquivos” nem “Abrir em outro app”, mantendo Android funcionando.

## Problema provável

Hoje o app gera um `.vcf` e tenta baixar/compartilhar pelo navegador. No Android isso é tolerante. No iOS, dependendo de onde o link foi aberto, ele cai em preview/Quick Look ou WebView, e o sistema mostra só o primeiro contato. Se o usuário está dentro de Safari/WhatsApp/Instagram/Facebook WebView, muitas vezes nem aparece a opção correta de salvar/abrir.

Então o problema não é só o conteúdo do vCard: é também o fluxo de entrega do arquivo no iOS.

## Correção proposta

### 1. Reformular o VCF para o formato mais compatível com Apple Contacts

Atualizar `src/lib/eleicao-distribuicao-contatos.ts` para gerar vCard 3.0 no padrão mais aceito pelo iOS:

- Remover separador extra estranho entre cards e garantir cada contato como bloco independente bem fechado.
- Gerar o arquivo com `CRLF` real em todas as linhas.
- Adicionar `X-ADDRESSBOOKSERVER-KIND:individual`, compatível com Apple Contacts.
- Usar `N:;Nome;;;` em vez de repetir tudo no primeiro campo de sobrenome.
- Manter `FN`, `TEL;TYPE=CELL`, `NOTE`, `UID` único e `PRODID`.
- Remover qualquer caractere antes do primeiro `BEGIN:VCARD`.
- Validar contagem de `BEGIN:VCARD` e `END:VCARD` antes de baixar/enviar.

### 2. Criar um fluxo especial para iPhone: “Enviar para o iPhone”

Não depender mais apenas do download direto no iOS.

Criar uma função nova no helper `mobile-download.ts` para arquivos de contato:

- Se for iOS e suportar Web Share com arquivo: abrir a folha nativa de compartilhamento com o `.vcf` como arquivo real.
- Se o Web Share falhar/cancelar/não suportar: mostrar uma tela/modal própria com alternativas claras.
- Em Android/desktop: manter download tradicional.

### 3. Adicionar tela/modal de resgate para iPhone

Quando o iOS não permitir download direto, mostrar uma tela com botões grandes:

1. **Compartilhar arquivo**
   - tenta novamente `navigator.share({ files })`.
2. **Enviar pelo WhatsApp**
   - usa o arquivo público gerado no storage e envia o link ao usuário/coordenador.
3. **Copiar link do arquivo**
   - para abrir no Safari fora do WebView.
4. **Baixar CSV Google**
   - alternativa de segurança para importar via Google Contacts/iCloud quando o iOS local continuar limitando.

A mensagem deixa claro: no iPhone, abrir o `.vcf` direto no preview pode mostrar 1 contato; o caminho seguro é usar a folha de compartilhamento ou importar via Google/iCloud.

### 4. Gerar sempre uma URL pública do VCF para iPhone

Na aba de distribuição, já existe upload para o storage em alguns fluxos. Vamos padronizar:

- Antes de abrir o fluxo iPhone, gerar/subir o `.vcf` no bucket.
- Usar essa URL no botão de copiar link e no WhatsApp manual.
- Registrar o lote apenas depois de confirmar que o arquivo foi gerado.

Na conversão de lista externa, como hoje é 100% local, há duas opções:

- Implementação imediata: usar Web Share/download local e fallback para CSV.
- Implementação completa: permitir upload temporário do VCF gerado para obter link público também no conversor externo.

### 5. Oferecer alternativa realmente confiável para massa grande no iPhone

Adicionar botão destacado: **CSV Google / iCloud**.

Porque, na prática, quando o iOS insiste em mostrar só 1 contato e não oferece salvar/abrir, a importação mais estável para 300+ contatos é:

- Exportar CSV Google Contacts; ou
- Abrir no computador/iCloud.com e importar; ou
- Enviar o arquivo para o app Arquivos via compartilhamento nativo quando disponível.

O sistema deve apresentar isso como alternativa oficial, não como detalhe escondido.

### 6. Ajustar os botões existentes

Em `DistribuicaoContatosTab.tsx`:

- Trocar “Baixar .vcf” por dois caminhos mais claros:
  - **iPhone / Compartilhar contatos**
  - **Baixar .vcf Android/PC**
- Manter “CSV Google” visível.
- No envio ao coordenador, incluir instrução curta junto com o link do `.vcf`.

Em `ConverterListaExternaDialog.tsx`:

- Trocar “Baixar .vcf” por **Gerar contatos para celular**.
- Mostrar aviso específico quando detectar iPhone/WebView.
- Destacar CSV como plano B oficial.

### 7. Validação técnica

Adicionar validação simples antes de entregar o arquivo:

- Contar quantos contatos válidos existem.
- Contar quantos `BEGIN:VCARD` foram gerados.
- Se a contagem divergir, bloquear download e mostrar erro.
- Baixar um arquivo de teste pequeno com 3 contatos para validar visualmente em iPhone.

## Resultado esperado

- Android continua abrindo/importando normalmente.
- iPhone passa a ter um fluxo próprio, com compartilhamento nativo quando possível.
- Quando o iOS/WebView bloquear o caminho ideal, o usuário não fica sem saída: recebe link, WhatsApp e CSV Google/iCloud como alternativas claras.
- O coordenador não recebe só uma instrução genérica; recebe o arquivo/link no caminho mais provável de funcionar no iPhone.