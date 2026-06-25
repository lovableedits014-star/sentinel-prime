## Problema

No iPhone, ao abrir o `.vcf` gerado, só aparece **1 contato** mesmo quando o arquivo tem vários. No Android funciona. É uma limitação conhecida do iOS:

- Quando o `.vcf` é baixado via Safari e aberto direto, o iOS Contacts às vezes mostra só o primeiro vCard do arquivo, mesmo o arquivo estando correto.
- O iOS importa multi-vCard com mais confiabilidade quando: (a) cada vCard tem `UID` e `REV` próprios, (b) há `CRLF` final após o último `END:VCARD`, e (c) o usuário abre o arquivo pelo app **Arquivos → Compartilhar → Contatos** em vez de tocar direto no download.
- O caminho 100% confiável no iPhone é receber **um `.vcf` por contato** (ex: dentro de um `.zip`) ou importar via **iCloud.com** usando o CSV.

## Plano

### 1. Endurecer o vCard atual (`src/lib/eleicao-distribuicao-contatos.ts`)
- Adicionar `UID:` único por contato (hash do telefone) e `REV:` com timestamp.
- Garantir `\r\n` final após o último `END:VCARD` (hoje termina sem newline).
- Manter VERSION 3.0 (melhor compatibilidade iOS que 4.0).

### 2. Novo botão "Baixar para iPhone (.zip)"
Adicionar nos dois pontos de download (`DistribuicaoContatosTab.tsx` e `ConverterListaExternaDialog.tsx`):
- Gera **1 `.vcf` por contato** e empacota num `.zip` usando a lib `jszip` (já existente no projeto? checar; senão `bun add jszip`).
- Nome do arquivo: `MOR_001_Joao.vcf`, `MOR_002_Maria.vcf`...
- O usuário no iPhone: abre o zip pelo app Arquivos → seleciona tudo → Compartilhar → Contatos → "Adicionar todos".

### 3. Instrução visual pós-download
Após gerar `.vcf` ou `.zip`, mostrar um aviso curto:
> 📱 **iPhone:** se aparecer só 1 contato, baixe a versão **.zip (iPhone)** ou importe o **CSV no iCloud.com → Contatos**.

### 4. Helper compartilhado
Criar `gerarVcardIndividual(contato)` e `gerarZipVcardsIphone(contatos)` em `eleicao-distribuicao-contatos.ts` para reuso nos dois dialogs.

## Resumo de mudanças
- `src/lib/eleicao-distribuicao-contatos.ts` — UID/REV/CRLF final + novas funções `gerarVcardIndividual` e `gerarZipVcardsIphone`.
- `src/components/eleicao/DistribuicaoContatosTab.tsx` — botão "Baixar para iPhone (.zip)" + aviso.
- `src/components/eleicao/ConverterListaExternaDialog.tsx` — mesmo botão + aviso.
- Possível `bun add jszip` se ainda não estiver instalado.

Nada no backend muda.