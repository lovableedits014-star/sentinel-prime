## Remover painel "Bairros sem coordenador"

A premissa da análise não vale para este gabinete — líderes sem coordenador pertencem ao próprio gabinete, então sinalizar isso como "lacuna" é falso positivo.

### Mudanças em `src/components/territorial/CityCoverageMap.tsx`

1. **Remover o card KPI "Lacunas"** (linhas ~409–413).
2. **Remover o card KPI "Cobertura por bairro"** (linhas ~404–408) — ele é derivado da mesma análise e perde sentido sem o painel.
3. **Remover o painel lateral "Bairros sem coordenador"** inteiro (linhas ~572–610).
4. **Ajustar o grid do mapa**: trocar `<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">` + `<Card className="lg:col-span-2">` por um único `<Card>` sem grid (ou `lg:col-span-3`), para o mapa ocupar a largura toda.
5. **Limpar o `useMemo` `gapAnalysis`** (linhas ~160–180) — não tem mais consumidores. Manter o import de `AlertTriangle` se ele ainda for usado no aviso de geocoding pendente (linha 420), senão remover.

Sem mudanças de banco, sem mudanças em outros arquivos.