## Problema

O iOS Safari/Mail/Arquivos historicamente abre apenas o **primeiro** vCard de um arquivo `.vcf` com múltiplos contatos quando aberto direto do navegador/download. Mas existem caminhos confiáveis para importar **300+ contatos em um único arquivo** no iPhone — o problema atual não é o formato em si, é **como o iOS está abrindo o arquivo**.

## Diagnóstico do que está acontecendo

1. Quando o usuário clica em "Baixar VCF" no Safari iOS, o iOS tenta **pré-visualizar** o arquivo no Quick Look → só mostra o primeiro contato.
2. Se o arquivo for **salvo no app Arquivos** e aberto a partir de lá com "Compartilhar → Contatos", o iOS importa **todos** os contatos do mesmo `.vcf` único (testado e documentado pela Apple).
3. O `.zip` que implementei na rodada anterior é só um plano B — não é necessário se ajustarmos o fluxo de download e instruirmos corretamente.

## Plano de correção (voltar ao arquivo único)

### 1. Ajustar o vCard único para máxima compatibilidade iOS
- Manter vCard **3.0** (iOS prefere 3.0 sobre 4.0 para importação em massa).
- Garantir `CRLF` (`\r\n`) em todas as linhas, incluindo entre contatos (já feito).
- Remover `UID`/`REV` que adicionei — em alguns casos o iOS trata como duplicata e ignora. Voltar ao mínimo: `BEGIN`, `VERSION:3.0`, `N`, `FN`, `TEL`, `CATEGORIES`, `END`.
- Não colocar linha em branco entre contatos (iOS é sensível a isso).

### 2. Forçar download "puro" em vez de preview no iOS
- Trocar o `Content-Type` para `text/vcard; charset=utf-8` (alguns iOS abrem melhor) **ou** `application/octet-stream` para forçar "Salvar em Arquivos" em vez de Quick Look.
- Em `src/lib/eleicao-distribuicao-contatos.ts` e `ConverterListaExternaDialog.tsx`, ajustar o `Blob` e adicionar `download="contatos.vcf"` explicitamente.

### 3. Remover o botão "ZIP iPhone" e simplificar a UX
- Manter **apenas um botão**: "Baixar VCF" (arquivo único).
- Substituir o aviso anterior por uma instrução clara e curta específica para iPhone:
  > **iPhone:** ao clicar em Baixar, escolha **"Salvar em Arquivos"**. Depois abra o app **Arquivos**, toque no `.vcf` e selecione **"Adicionar todos os N contatos"**.
- Adicionar essa nota tanto em `DistribuicaoContatosTab.tsx` quanto em `ConverterListaExternaDialog.tsx`.

### 4. Remover código morto
- Remover a função `gerarZipVcardsIphone` e a dependência implícita de zipagem que não será mais usada.

## Arquivos afetados

- `src/lib/eleicao-distribuicao-contatos.ts` — simplificar vCard, ajustar MIME type, remover gerador ZIP.
- `src/components/eleicao/ConverterListaExternaDialog.tsx` — remover botão ZIP, ajustar texto de instrução.
- `src/components/eleicao/DistribuicaoContatosTab.tsx` — mesmo ajuste de UX.

## Resultado esperado

Um único `.vcf` baixado importa todos os 300+ contatos no iPhone via app Arquivos → Adicionar todos os contatos, sem precisar de ZIP nem de arquivos individuais.
