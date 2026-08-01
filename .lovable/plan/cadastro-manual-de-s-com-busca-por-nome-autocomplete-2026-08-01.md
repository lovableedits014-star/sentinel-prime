# Cadastro manual de @s com busca por nome (autocomplete)

## O que você quer

Cadastrar as redes do time uma por uma, digitando o nome e vendo o sistema sugerir, enquanto digita, as pessoas com aquele nome — e a partir daí cadastrar Instagram e Facebook na mesma tela.

## A solução

Um único diálogo **"Cadastrar perfil"** na aba Engajamento → Perfis do Time, com busca-enquanto-digita em duas frentes ao mesmo tempo:

1. **Pessoas já cadastradas** (CRM, funcionários, contratados, apoiadores) — os mesmos nomes que a tabela já mostra hoje.
2. **Autores reais que já comentaram** no Facebook e no Instagram e ainda não estão vinculados a ninguém — com nome e foto de perfil da Meta.

Fluxo em uma tela:

```text
[ Digite o nome: "joão bat" ]

PESSOAS CADASTRADAS
  João Batista da Silva   (Funcionário)      -> selecionar
  Joana Batista           (Eleitor)          -> selecionar

AINDA NÃO VINCULADOS (quem comentou nas redes)
  [foto] Joao Batista       Facebook · 4 comentários   provável
  [foto] joaobatista_cg     Instagram · 2 comentários
```

- Ao selecionar uma pessoa, o diálogo abre a ficha dela com dois campos:
  - **Instagram**: aceita `@nome`, `nome` ou URL — normaliza sozinho.
  - **Facebook**: escolhido pela lista de autores reais (é a única forma que a Meta permite rastrear), com destaque "provável" para os nomes parecidos.
- Se o nome digitado não existir em nenhuma das listas, aparece o botão **"Criar pessoa 'João Batista'"**, que abre o cadastro rápido já com o nome preenchido e volta para a ficha de @s — sem sair do fluxo.
- Após salvar, o diálogo limpa e volta para o campo de nome, pronto para a próxima pessoa (cadastro em série, um por um, sem fechar).
- Cada salvamento mostra quantas interações passadas foram reaproveitadas e a linha da tabela já aparece com o semáforo atualizado (Rastreável / Aguardando interação).

## Detalhes técnicos

- Novo componente `src/components/engagement/CadastrarPerfilDialog.tsx`, aberto pelo botão "Cadastrar perfil" no cabeçalho de `PerfisTimeTab.tsx` (ao lado de "Adicionar pessoa").
- Autocomplete de pessoas: filtro em memória sobre as linhas já carregadas por `engagement_perfis_overview` (normalização sem acento, match por tokens) — zero consulta extra.
- Autocomplete de autores: `engagement_unlinked_authors` chamado uma vez por plataforma (`facebook` e `instagram`) ao abrir o diálogo, com cache local; reaproveita as funções `norm`/`similarity` já existentes em `VincularAutorDialog.tsx` (serão extraídas para `src/lib/engagement-match.ts` para uso nos dois).
- Gravação: `engagement_upsert_social` (Instagram) e `engagement_link_author` (Facebook/Instagram por autor real) — RPCs já existentes, nada de nova migração.
- Criar pessoa: reuso de `NovaPessoaDialog` com o nome pré-preenchido; ao concluir, `fetchData()` e seleção automática da pessoa criada.
- `VincularAutorDialog.tsx` continua funcionando como está para o vínculo a partir da linha da tabela.
