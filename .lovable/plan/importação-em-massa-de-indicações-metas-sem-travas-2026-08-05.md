# Importação em massa de indicações + metas sem travas

## Objetivo

Na aba **Indicações** (Eleição), permitir subir uma planilha Excel/CSV com **nome, telefone e bairro** em nome de um indicador, acabar com qualquer trava de quantidade (todos podem indicar à vontade) e manter a **meta** apenas como sinalizador: quem estiver abaixo aparece marcado como "fora da meta".

## O que muda para você

1. **Botão "Importar planilha"** em cada indicador da lista (ao lado de "Cadastrar" manual), e também um importador geral onde você escolhe o indicador antes de subir.
2. **Fluxo do import (3 passos)**
   - Sobe o arquivo (.xlsx, .xls ou .csv).
   - Mapeia as colunas: Nome, Telefone, Bairro (o sistema tenta adivinhar pelos títulos).
   - Vê a prévia: quantos válidos, quantos com telefone inválido, quantos duplicados (repetidos dentro da própria planilha e já existentes no banco), e confirma.
3. **Relatório após importar**: inseridos, ignorados por duplicidade (com o nome de quem já tinha o número) e linhas inválidas, com opção de baixar a lista de erros para corrigir e subir de novo.
4. **Sem limite de indicações**: as travas de quantidade saem. Ninguém é bloqueado por indicar muito.
5. **Alerta de meta**: metas passam a ser Coordenador 40, Líder 25, Cabo 2 (editáveis na aba "Metas e configurações"). Quem está abaixo recebe selo vermelho/âmbar **"Fora da meta — faltam X"**, e quem bateu recebe selo verde. O filtro "Abaixo da meta" e a cobrança em massa continuam funcionando com esses números.

## Detalhes técnicos

### Banco
- Nova função `eleicao_indicar_lote(_indicador_id, _linhas jsonb)`:
  - normaliza telefone (só dígitos, aceita 10–13), valida nome;
  - deduplica dentro do lote e contra `eleicao_indicados.telefone_norm` do mesmo cliente;
  - insere em uma só transação com `origem = 'importacao_planilha'`;
  - retorna `{inseridos, duplicados[], invalidos[]}` para o relatório.
- `eleicao_indicar_via_token`: remove o bloqueio `limite_diario` (deixa de retornar `limite_diario`); o campo `limite_diario_token` deixa de barrar cadastro.
- `eleicao_indicacao_config`: novos defaults `meta_coordenador = 40`, `meta_lider = 25`, `meta_cabo = 2`; atualiza a linha do cliente atual para esses valores.
- View `v_eleicao_indicadores_cobranca`: fallbacks de meta alinhados a 40/25/2 e coluna calculada `fora_da_meta`.

### Frontend
- `src/components/eleicao/ImportarIndicadosDialog.tsx` (novo): upload + mapeamento + prévia + relatório, usando a lib `xlsx` já presente no projeto.
- `src/components/eleicao/IndicacoesPanel.tsx`: botão de importar por linha, selo "Fora da meta — faltam X" / "Meta ok", KPI de quantos estão fora da meta, e remoção do campo/aviso de limite diário na aba de configurações (fica só as três metas).
- Cadastro manual inline continua igual, sem qualquer bloqueio por quantidade.

## Fora de escopo
Nada é alterado nos disparos de WhatsApp, na página pública `/indicar/:token` além da remoção da trava, nem na hierarquia de coordenador/líder/cabo.
