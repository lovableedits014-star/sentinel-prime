Plano urgente para corrigir a classificação territorial e impedir novos erros:

1. Corrigir os cadastros existentes sem cidade
- Atualizar todos os registros de `eleicao_pessoas` que estão sem cidade para constar como Campo Grande/MS no cadastro.
- Hoje há 105 cadastros eleitorais; 103 estão sem cidade preenchida.
- Isso corrige a classificação territorial que hoje agrupa muita gente como “Sem cidade”, mesmo quando o bairro é de Campo Grande.

2. Reprocessar a geocodificação de forma mais rígida por bairro
- Limpar as coordenadas/geocode dos cadastros afetados para forçar novo processamento.
- Ajustar a geocodificação para tratar bairro como informação obrigatória/prioritária quando existir.
- Para cadastros de Campo Grande/MS, montar sempre a busca como: bairro + Campo Grande + MS + Brasil.
- Validar o retorno do Google para aceitar somente resultados dentro da área esperada de Campo Grande/MS, exceto casos explicitamente marcados como distrito/interior.
- Se o Google não conseguir confirmar o bairro/cidade com segurança, deixar o cadastro pendente em vez de salvar coordenada duvidosa.

3. Tratar casos como Diego Garcia corretamente
- Diego Garcia está com bairro `Centro Oeste` e coordenada no centro de Campo Grande; ele não parece estar fora do mapa.
- O erro principal é que o cadastro dele está sem cidade, então o sistema fica vulnerável a classificação incompleta/ambígua.
- Após atualizar cidade para Campo Grande/MS e reprocessar/validar, ele deve aparecer classificado por Campo Grande/MS + bairro Centro Oeste.

4. Mostrar auditoria clara no mapa
- Adicionar um painel de qualidade no mapa com contadores separados:
  - total de cadastros;
  - no mapa;
  - sem cidade;
  - sem bairro;
  - pendentes de geocodificação;
  - fora da área esperada.
- Adicionar uma lista “Ver pendências” para identificar quem não está aparecendo ou quem precisa correção manual.
- Assim o sistema não fica “parecendo” que faltam pessoas: ele mostra exatamente quantas estão no mapa e por que alguma não aparece.

5. Ajustar novos cadastros para exigir cidade
- Na tela Eleição, para Campo Grande, preencher automaticamente cidade como Campo Grande/MS em novos cadastros.
- No Portal do Coordenador, manter cidade visível e pré-preenchida como Campo Grande/MS quando o escopo for Campo Grande.
- No diálogo “Nova Pessoa”, adicionar cidade para coordenador/líder/cabo e usar Campo Grande/MS como padrão, permitindo alterar se necessário.
- Quando o cadastro for Interior, manter a cidade obrigatória e escolhida/preenchida pelo usuário.

6. Evitar geocode velho após edição
- Quando bairro, rua, número ou cidade forem alterados em um cadastro, limpar `lat`, `lng`, `geocode_status`, `geocoded_at` e `geocode_endereco_hash` para obrigar nova geocodificação.
- Isso impede que um cadastro editado continue preso em uma coordenada antiga.

7. Validar depois da correção
- Conferir no banco:
  - zero cadastros eleitorais sem cidade, quando forem de Campo Grande;
  - zero cadastros Campo Grande/MS fora da área esperada, salvo distrito/interior;
  - todos os bairros principais agrupando corretamente em Campo Grande/MS;
  - Diego Garcia em Campo Grande/MS + Centro Oeste.
- Conferir na interface do mapa se o contador “No mapa” bate com o total esperado e se a lista de pendências explica qualquer exceção.

Implementação prevista:
- Fazer uma atualização de dados nos cadastros existentes.
- Ajustar `supabase/functions/geocode-eleicao-pessoas/index.ts`.
- Ajustar `src/components/territorial/CityCoverageMap.tsx`.
- Ajustar os formulários em `src/pages/Eleicao.tsx`, `src/pages/PortalCoordenador.tsx` e `src/components/pessoas/NovaPessoaDialog.tsx`.