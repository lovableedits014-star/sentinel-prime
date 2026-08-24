# Dados do contratado: CPF, RG, órgão expedidor e CEP no contrato e distrato

Hoje o cadastro de Eleição não guarda CPF, RG, órgão expedidor nem CEP (confirmado nas colunas de `eleicao_pessoas`), por isso o contrato sai com linhas em branco nesses pontos. O objetivo é preencher automaticamente tudo o que é dado cadastral e deixar linha para preencher à mão só o que você quer: vigência (início/término), dados bancários e a data do contrato.

## O que muda

### 1. Cadastro de pessoa (Eleição)
Novos campos no formulário de criar/editar pessoa, em um bloco "Documentos e endereço":
- CPF (com máscara e validação de dígitos, igual ao resto do sistema)
- RG
- Órgão expedidor (ex.: SEJUSP/MS)
- CEP (máscara 00000-000)

Ficam opcionais — você vai editando cadastro por cadastro sem travar nada.

### 2. Contrato
No parágrafo de qualificação do CONTRATADO passam a sair automáticos:
- CPF, RG, órgão expedidor
- Rua, número, bairro, CEP, cidade (rua/número/bairro já existiam)

Continuam como linha para preencher à mão:
- Início e término da vigência: `(____/____/______)`
- Banco, agência, conta, chave Pix
- Data do contrato ("Campo Grande, ____ de __________ de ______")

Na assinatura final, abaixo do nome, o CPF é puxado automático ("CPF: 000.000.000-00"); se o cadastro ainda não tiver CPF, sai a linha em branco.

### 3. Distrato
Mesmo tratamento: nome e CPF automáticos na qualificação e na assinatura, data à mão.

## Detalhes técnicos

- Migração: adicionar `cpf`, `rg`, `rg_orgao_expedidor` e `cep` (text, nulos) em `eleicao_pessoas`.
- `src/lib/eleicao-contrato-docx.ts`: incluir `cpf`, `rg`, `rg_orgao_expedidor`, `cep` na interface `PessoaContratada` e nos placeholders de `renderTemplate` — `{cpf}`, `{rg}`, `{orgao_expedidor}`, `{cep}` — com formatação (CPF `000.000.000-00`, CEP `00000-000`) e fallback para linha `____` quando vazio. Os placeholders de vigência passam a render linha fixa em vez de data, e a data do documento vira linha (novos `{dia_linha}`, `{mes_linha}`, `{ano_linha}` ou simplesmente linhas no texto padrão).
- `src/lib/eleicao-contrato-defaults.ts`: atualizar CONTRATO_PADRAO e DISTRATO_PADRAO para usar os novos placeholders no lugar das linhas fixas de CPF/RG/órgão/CEP, mantendo linhas para banco/vigência/data.
- `src/pages/Eleicao.tsx`: adicionar os 4 campos ao estado do formulário, ao payload de insert/update, à interface local e às consultas que alimentam a geração de documentos (individual e em lote .zip).
- Templates já salvos no banco continuam funcionando; quem quiser o texto novo usa "Restaurar padrão" no editor de templates.
