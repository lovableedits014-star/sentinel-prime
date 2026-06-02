## Contexto

O `ExportEleicaoDialog` recém-criado permite filtrar por tipo, coordenador específico e avulsos, mas **não tem filtro de região/cidade próprio**. Hoje, no `handleExport`, a região vinda do filtro da tela (`regiaoFilter`) **não é aplicada** — quem dita o recorte regional é o usuário escolher na tela antes. Precisa ser explícito no dialog.

## Plano

### 1. `ExportEleicaoDialog.tsx`
- Adicionar prop `regioes: { value: string; label: string }[]` (lista de regiões/cidades disponíveis no escopo atual).
- Adicionar prop `escopoLabel: "regiao" | "cidade"` para o label correto ("Região" em Campo Grande, "Cidade" em Interior).
- Novo campo no formulário: `<Select>` "Região / Cidade" com opção "Todas" + cada região/cidade. Estado interno `regiao: string` (default `"__all"`).
- Incluir no `ExportConfig` o campo `regiao: string | null` (null = todas).

### 2. `Eleicao.tsx`
- Calcular `regioesParaExport`:
  - Em Campo Grande: usar `REGIOES` (do hook) filtrando só as que têm gente cadastrada no escopo.
  - Em Interior: derivar `cidades` únicas das `pessoas` do escopo.
- Passar `regioes` e `escopoLabel` para o dialog.
- Em `handleExport(cfg)`:
  - Aplicar o filtro de região depois do filtro de escopo: `p.escopo === escopo && (escopo === "interior" ? p.cidade === cfg.regiao : p.regiao === cfg.regiao)` quando `cfg.regiao` está definido.
  - Adicionar a região escolhida no array `filtros` que vai no header do PDF/CSV.
- Quando o usuário escolhe um **coordenador específico**, esconder/ignorar o filtro de região (a equipe pode atravessar regiões? Aqui não — cada pessoa tem sua região; mantemos consistência: se ambos forem definidos, aplica os dois).

### 3. Detalhes de UX
- O select de região aparece **acima** do filtro de coordenador, já que define o universo.
- Se "Todas as regiões" estiver escolhido, comportamento atual permanece.
- Filtro independente do `regiaoFilter` da tela — o dialog tem seu próprio recorte para exportação.

## Arquivos afetados

- `src/components/eleicao/ExportEleicaoDialog.tsx` — novo campo + tipo `ExportConfig`.
- `src/pages/Eleicao.tsx` — calcular lista de regiões, passar ao dialog, aplicar filtro em `handleExport`.

Sem mudanças de banco.
