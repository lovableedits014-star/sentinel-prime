# Por que o painel está vazio

O componente `VotosVoluntariosPanel` (no fim da página do coordenador) já existe e já tem o card do próprio coordenador com o formulário "Adicionar indicação de voto voluntário". Ele simplesmente não aparece porque o RPC `eleicao_listar_indicadores_team` está **falhando em runtime** com:

```
ERROR: column reference "tipo" is ambiguous
```

Acontece porque a função declara `tipo` como coluna de retorno e ao mesmo tempo usa `WHERE ... AND tipo = 'coordenador'` sem qualificar a tabela. Como o RPC dá erro, o componente cai no `setRows([])` → `me` fica `null` → o card do coordenador (com o formulário) não é renderizado e a equipe aparece vazia, exatamente como no print.

Confirmado executando o RPC com o `auth.uid` do Cleber: erro reproduzido. Sem o erro, o "team" recursivo retorna 10 pessoas (Cleber + 9 líderes), que é o esperado.

# O que vou fazer

**1 migração** (1 linha funcional alterada) — recriar `public.eleicao_listar_indicadores_team(uuid)` qualificando a referência:

```sql
WHERE id = _coordenador_id
  AND eleicao_pessoas.tipo = 'coordenador'::eleicao_tipo
```

Nada mais muda: mesmas colunas de retorno, mesmo `SECURITY DEFINER`, mesma checagem `auth.uid() = user_id`, mesmo `GRANT EXECUTE TO authenticated`.

# Resultado esperado no portal do coordenador

Após a migração, no fim da página de `Cleber de Paula` vai aparecer:

- Cabeçalho **"Votos voluntários (eleitores que não são contratados)"** (já existe).
- Resumo TOTAL / META / PESSOAS preenchido (10 pessoas).
- **Card destacado do próprio coordenador (Cleber)** com:
  - Barra de progresso da meta pessoal.
  - Botão "Abrir minha página de indicação" + "Copiar link".
  - **Formulário "Adicionar indicação de voto voluntário"** (Nome, Telefone com máscara `(DD) 9XXXX-XXXX`, Bairro opcional, botão Cadastrar).
  - Histórico "Últimos eleitores que você cadastrou" com botão remover (até 1h).
- Lista dos 9 líderes abaixo, cada um com botões: cadastrar voto em nome dele (`UserPlus`), copiar link, enviar WhatsApp.

Tudo já contabiliza automaticamente na aba "Indicações" em Eleição (mesmas tabelas / mesmo RPC `eleicao_indicar_via_token`), então a cobrança continua funcionando exatamente igual.

# Não vou mexer

- Nenhum arquivo TSX precisa mudar — o componente já está correto.
- Nenhuma outra RPC, view ou política.
