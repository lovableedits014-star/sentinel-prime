## Problema

No iPhone, ao abrir o `.vcf` gerado, só aparece **1 contato** ("Adicionar 1 contato" em vez de "Adicionar todos os N"). No Android funciona. Na última iteração eu tinha:
- Removido `UID`/`REV` (pra evitar duplicatas)
- Trocado MIME pra `application/octet-stream` (pra forçar "Salvar em Arquivos")
- Mantido CRLF entre cards

Essa combinação é justamente o que quebra o iOS: sem `UID` o parser do iOS Contacts faz dedup pelo `FN` e descarta tudo que ele acha "parecido"; e o MIME `octet-stream` faz o app **Arquivos** abrir o arquivo no Quick Look (que historicamente mostra só o primeiro cartão) em vez de entregar pro app Contatos.

## Correção

### 1. `src/lib/eleicao-distribuicao-contatos.ts`
Reescrever `gerarVcardIndividual` para o formato que o iOS 16+ aceita em lote:

- Adicionar `PRODID:-//Lovable//Eleicao//PT` em cada card (iOS usa pra identificar o gerador e processa em lote).
- Adicionar `UID:` único por contato (`urn:uuid:` + hash do telefone+nome). Sem UID o iOS deduplica pelo nome quando há prefixo de TAG repetido.
- Garantir uma **linha em branco (CRLF CRLF)** entre cards. Hoje só tem CRLF simples; alguns parsers do iOS exigem o separador.
- Manter `N:` e `FN:` (já corretos).
- Reordenar campos no padrão que o iOS espera: `BEGIN → VERSION → PRODID → UID → N → FN → TEL → NOTE → END`.

### 2. `src/components/eleicao/ConverterListaExternaDialog.tsx` e `DistribuicaoContatosTab.tsx`
- Voltar o MIME para **`text/vcard;charset=utf-8`** (não `octet-stream`). O Safari/iOS hoje já oferece "Salvar em Arquivos" pra vcard direto.
- Atualizar o aviso do iPhone: a recomendação correta é abrir o `.vcf` pelo app **Arquivos** → tocar uma vez → vai aparecer "Adicionar todos os N contatos". Se abrir pelo Safari ou pelo Mail, o iOS realmente mostra só 1 — adicionar essa ressalva explícita.

### 3. Validação
Após o build, abrir o `.vcf` gerado num editor e conferir:
- Cada card começa com `BEGIN:VCARD` e termina com `END:VCARD\r\n\r\n`
- Cada card tem um `UID:` único
- Não tem BOM nem caracteres antes do primeiro `BEGIN:VCARD`

## Por que isso resolve

O iOS Contatos importa múltiplos vCards em lote **somente** quando: (a) os cards têm `UID` único, (b) estão separados por linha em branco, e (c) o sistema entrega o arquivo com MIME `text/vcard` (que dispara o handler do Contatos). Faltando qualquer um dos três, ele fica no Quick Look e mostra só o primeiro. Android é tolerante a tudo isso, por isso só o iPhone falha.

## Arquivos alterados
- `src/lib/eleicao-distribuicao-contatos.ts`
- `src/components/eleicao/ConverterListaExternaDialog.tsx`
- `src/components/eleicao/DistribuicaoContatosTab.tsx`
