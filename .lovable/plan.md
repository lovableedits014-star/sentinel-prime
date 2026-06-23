## Contexto atual

Hoje o cadastro de eleição (`src/pages/Eleicao.tsx`) trata **Interior** diferente de **Campo Grande**:

- Em Campo Grande os tipos são **Coordenador → Líder → Cabo eleitoral**, com a opção de **Líder avulso** (sem coordenador vinculado).
- Em Interior o seletor de "Tipo" **esconde a opção Líder** (linha 1051) e, ao trocar o escopo para Interior, qualquer tipo "lider" é forçado para "cabo" (linha 1058). Resultado: no interior só se cadastra Coordenador e Cabo direto sob o coordenador.

A infraestrutura para líderes (vinculados e avulsos) já existe e é genérica:
- `possibleParents` (linha 629) já filtra por `cidade` quando o escopo é interior.
- `stats.avulsos`, filtro "⚡ Líderes avulsos" e o bloco visual "Líderes avulsos (sem coordenador)" no `RegionBlock` (linha 1534) já funcionam independentemente do escopo.
- `CoordBlock` já renderiza `lideres` (filhos do coordenador) e mantém `cabosDir` (cabos direto no coordenador) — então dados antigos do interior continuam aparecendo.

Ou seja, é só **liberar o tipo Líder no Interior**; o resto do fluxo (relatórios, contratos, envio de credenciais, KPIs) já se encaixa.

## Mudanças propostas

Tudo em `src/pages/Eleicao.tsx`, sem migração de banco (a tabela já aceita `tipo='lider'` em qualquer escopo):

1. **Liberar "Líder" no seletor de Tipo para Interior**
   - Remover a condição `form.escopo === "campo_grande"` na linha 1051; o item Líder fica visível em ambos os escopos.

2. **Parar de forçar Líder → Cabo ao trocar escopo**
   - No `onValueChange` do Escopo (linha 1058), remover a coerção `tipo: v === "interior" && f.tipo === "lider" ? "cabo" : f.tipo`. Mantém o tipo escolhido.

3. **Ajustar mensagens do formulário para refletir cidade no Interior**
   - Os textos genéricos ("Indicado por (Coordenador/Líder)", "Nenhum X cadastrado nesta cidade/região…") já estão corretos — apenas conferir após a mudança.

4. **CTA do estado vazio do Interior**
   - Manter "Cadastrar primeiro coordenador" (fluxo natural continua sendo começar pelo coordenador da cidade); nenhum ajuste extra necessário.

5. **Validação ao salvar**
   - Não precisa mudar: a regra "líder precisa de coordenador OU ser marcado como avulso" já vale para os dois escopos. O ramo `escopo === "interior" && !form.cidade.trim()` (linha 332) continua exigindo a cidade.

6. **Listagem por cidade**
   - `interiorCidades` (linha 606) já cobre cidades de qualquer pessoa do escopo interior; um líder avulso de uma cidade nova fará a cidade aparecer automaticamente. O bloco "Líderes avulsos (sem coordenador)" dentro de cada `RegionBlock` passa a aparecer também no Interior sem mexer nele.

## Fora de escopo

- Schema/RLS do Supabase: nada muda.
- Telemarketing, contratos, exports: já tratam `tipo='lider'` de forma genérica.
- Portais de coordenador/líder: já existentes, sem ajuste.

## Resumo técnico

Duas edições pontuais no `Dialog` de cadastro de `src/pages/Eleicao.tsx`:
- Linha 1051: remover gate de escopo do `<SelectItem value="lider">`.
- Linha 1058: remover a coerção de tipo no `onValueChange` do Escopo.

Tudo o resto (avulsos vs vinculados, KPIs, blocos visuais, envio de credenciais, contratos) já funciona para Interior assim que o tipo Líder fica disponível.