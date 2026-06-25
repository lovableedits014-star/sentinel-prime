## Problema

A aba **Distribuição de Contatos** só lista regiões cujo coordenador está marcado como `is_favorito_regiao = true`. Em Campo Grande há 9 principais marcados; no interior, nenhum dos 30 coordenadores está — por isso as cidades do interior somem da lista.

Além disso, surge uma necessidade nova: poder **subir uma planilha externa (Excel/CSV)** e converter em `.vcf` direto, sem precisar cadastrar essas pessoas como eleitores no sistema.

## Solução

### Parte A — Habilitar interior na Distribuição

**1. UI: bloco "Configurar principais do interior"** dentro de `DistribuicaoContatosTab.tsx`, acima da lista de regiões:
- Card amarelo de aviso quando há cidades do interior com coordenadores cadastrados mas sem principal definido ("X cidades sem principal — defina pra liberar a distribuição").
- Para cada cidade: select dos coordenadores daquela cidade + botão "Definir como principal".
- Botão "trocar principal" em cada card de região já listada.

**2. Banco — RPCs auxiliares**
- `eleicao_definir_principal_regiao(_client_id, _coordenador_id)`: marca o alvo como `is_favorito_regiao = true` e desmarca os outros da mesma cidade/região (1 principal por cidade). SECURITY DEFINER + checagem `user_can_access_client`.
- `eleicao_listar_cidades_interior_sem_principal(_client_id)`: retorna cidades do interior com candidatos `(id, nome, telefone)`.

**3. Tag por cidade do interior**
- Ao definir o principal de uma cidade do interior, garantir linha em `eleicao_regioes` (escopo=interior, nome=cidade, tag auto via `normalizeTag(cidade)` — ex: Dourados→DOU, Três Lagoas→TRL).
- Tag editável inline igual nas regiões de Campo Grande.

**4. Hook `useRegioesEleicao`**
- Estender para incluir escopo `interior` (hoje só Campo Grande).

---

### Parte B — Converter planilha externa em VCF

Novo card na aba Distribuição: **"Converter lista externa em VCF"** (independente das regiões/coordenadores cadastrados — útil para listas de fora do sistema).

**1. UI — Dialog `ConverterListaExternaDialog.tsx`**
- Upload de `.xlsx`, `.xls` ou `.csv` (drag & drop + botão).
- Parse no client com `xlsx` (SheetJS, já leve, sem dependência Node).
- Preview das primeiras 10 linhas em tabela.
- **Mapeamento de colunas** (selects): "Coluna do Nome", "Coluna do Telefone", "Coluna da Cidade/Bairro" (opcional). Sistema tenta auto-detectar pelos headers (nome/name, telefone/phone/celular, cidade/bairro).
- Campo **TAG** (opcional, ex: "VIP", "EVENTO", "LISTA1") — aplicada como prefixo no nome.
- Validação ao vivo: contador de "X válidos / Y inválidos (sem telefone)".
- Botão **Gerar e baixar .vcf** + botão **Baixar CSV Google Contacts**.

**2. Lógica**
- Reaproveita helpers existentes (`gerarVcardLote`, `gerarCsvGoogleContacts`, `aplicarTag`, normalização de telefone) de `src/lib/eleicao-distribuicao-contatos.ts`.
- Normaliza telefone (só dígitos, prefixo 55).
- Ignora linhas sem telefone válido (mostra contagem).
- Tudo no client — não persiste nada no banco (lista externa não polui base de eleitores).

**3. Opcional — Enviar pelo WhatsApp**
- Após gerar o .vcf, botão "Enviar via WhatsApp" abre dialog pedindo telefone do destinatário e mensagem.
- Reaproveita a edge function `eleicao-enviar-pacote-contatos` em modo "lista externa" (sem `coordenador_id`, sem gravar distribuições).
- Para a v1, basta o download — o envio direto pode ficar para iteração seguinte.

**4. Dependência**
- Adicionar `xlsx` (SheetJS) via `bun add xlsx`. ~400KB, mas só carrega no dialog (lazy import).

## Arquivos afetados

- `supabase/migrations/...sql` — RPCs `eleicao_definir_principal_regiao`, `eleicao_listar_cidades_interior_sem_principal`.
- `src/hooks/useRegioesEleicao.ts` — incluir escopo interior.
- `src/components/eleicao/DistribuicaoContatosTab.tsx` — bloco "principais do interior" + card "Converter lista externa".
- `src/components/eleicao/ConfigurarPrincipaisInteriorDialog.tsx` — novo.
- `src/components/eleicao/ConverterListaExternaDialog.tsx` — novo.
- `src/lib/eleicao-distribuicao-contatos.ts` — pequenos ajustes (já tem os helpers de vcf/csv).

## Resultado esperado

1. Aviso no topo da Distribuição: "X cidades do interior precisam de principal — definir agora" → após definir, cidade aparece com tag editável e botão Enviar.
2. Card separado "Converter lista externa em VCF": sobe Excel/CSV, mapeia colunas, aplica tag opcional, baixa `.vcf` pronto pra importar na agenda — sem precisar cadastrar ninguém no sistema.
