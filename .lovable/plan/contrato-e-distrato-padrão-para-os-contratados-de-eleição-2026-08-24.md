# Contrato e Distrato padrão para os contratados de Eleição

## Como estamos hoje

- Existem 3 modelos editáveis por campanha (`eleicao_coordenador`, `eleicao_lider`, `eleicao_cabo`), com texto livre e placeholders `{nome} {telefone} {endereco} {cidade} {regiao} {lider} {coordenador} {valor} {valor_extenso} {data} {contratante}`.
- A geração em .docx já aplica uma **aparência diferente por cargo** (fonte, faixa do cabeçalho, borda, símbolo, rodapé) e já suporta contrato individual e lote em ZIP, pulando voluntários.
- Hoje o texto de cada modelo é diferente por cargo, e não existe distrato.
- O cadastro de Eleição não tem CPF, RG, CEP nem dados bancários; tem nome, telefone, rua/número/bairro/cidade, região e valor.

## O que muda

1. **Texto único de contrato para os 3 cargos** — o conteúdo passa a ser o do documento enviado (Resolução TSE 23.607/2019, cláusulas 1ª a 7ª, dados do contratante ELEIÇÃO 2026 ADEMAR VIEIRA JUNIOR fixos no texto do modelo). O que varia por pessoa é nome, endereço, cidade, vigência e valor.
2. **Aparência continua diferente por cargo** — mantida a distinção visual atual (Coordenador / Líder / Cabo), então o mesmo texto sai com "cara" diferente.
3. **Distrato** — 3 novos modelos (`eleicao_distrato_coordenador`, `eleicao_distrato_lider`, `eleicao_distrato_cabo`) com o texto do Distrato enviado, seguindo a mesma aparência do cargo.
4. **Campos preenchidos à mão** — CPF, RG/órgão expedidor, CEP e banco/agência/conta/Pix saem como linhas pontilhadas para preenchimento manual (conforme sua escolha).
5. **Vigência individual** — cada contratado passa a ter data de início e término próprias, usadas na Cláusula Segunda; quando vazias, saem em branco.
6. **Saída pronta para imprimir** — ao gerar, sai o par completo por pessoa: `Coordenador NOME — Contrato.docx` e `Coordenador NOME — Distrato.docx`; em lote, um ZIP com os dois arquivos de cada pessoa (com opção de gerar só contrato, só distrato ou ambos).

## Placeholders do novo modelo

Além dos atuais: `{vigencia_inicio}`, `{vigencia_fim}`, `{bairro}`, `{rua}`, `{numero}`, `{cidade_uf}`, `{dia}`, `{mes}`, `{ano}` e `{linha}` (linha pontilhada para preenchimento manual).

## Detalhes técnicos

- **Migração**: adicionar `vigencia_inicio date` e `vigencia_fim date` em `eleicao_pessoas`; inserir os 6 modelos padrão (3 contratos + 3 distratos, mesmo conteúdo por grupo) para as campanhas que ainda não os têm, sem sobrescrever textos já editados.
- `src/lib/eleicao-contrato-docx.ts`: novos placeholders no `renderTemplate`, `tipoToTemplateKey` com variante contrato/distrato, `gerarLoteZip` e `gerarContratoIndividual` gerando o par de documentos; `TIPO_THEME` preservado.
- `src/components/eleicao/EleicaoContractTemplates.tsx`: abas em 2 níveis — Contrato / Distrato × Coordenador / Líder / Cabo, com botão "Restaurar texto padrão".
- Tela de Eleição: campos de vigência no cadastro/edição da pessoa e seletor Contrato / Distrato / Ambos na geração.
