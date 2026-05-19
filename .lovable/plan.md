## Objetivo
Tornar o campo "Rua" opcional no cadastro de eleição (SupporterRegister), mantendo "Bairro" como obrigatório.

## Arquivo
`src/pages/SupporterRegister.tsx`

## Mudanças
1. Remover a validação que bloqueia o envio quando `rua` está vazia (linhas 166-169).
2. No input do formulário (linha 472-477): trocar placeholder `"Rua *"` por `"Rua (opcional)"` e remover o atributo `required`.
3. Manter `neighborhood` (Bairro) obrigatório como está.
4. No payload (linha 192): enviar `endereco: rua.trim() || null` para suportar valor vazio.

Nenhuma outra tela de cadastro de eleição exige "Rua".