
## Diagnóstico — por que está confuso hoje

O fluxo atual está espalhado em 3 lugares diferentes e o operador **vê todos os contatos misturados**, sem vínculo com nenhuma "fila":

1. **Campanhas** → cria campanha + edita script + importa CSV + designa indicados da eleição (4 conceitos no mesmo card)
2. **Fila ao vivo** → mostra só contratados/indicados pendentes, **ignora CSV e eleição**
3. **Operadores** → cadastra operador, mas não conecta operador ↔ campanha

Resultado: você cria uma campanha, mas o operador continua vendo "tudo". Não dá pra testar uma fila específica.

---

## Proposta — 1 wizard, 1 fila por campanha, 1 link pronto

### A. Novo wizard "Nova fila de ligação" (substitui o card atual de Campanhas)

Um passo-a-passo único na aba **Campanhas**:

```text
[1] Nomeie a fila        →  "Bairro Centro - 1ª rodada"
[2] De onde vêm os nomes →  ( ) CSV/colar lista
                            ( ) Estrutura eleitoral (coord/líder/cabo)
                            ( ) Indicados (votos orgânicos)
                            ( ) Contratados/liderados
[3] Filtros              →  Cidade, bairro, tipo, indicador…
                            "Apenas não ligados" (default ON)
[4] Pré-visualização     →  "1.247 contatos entrarão na fila"
[5] Script & tags        →  Intro + perguntas + tags rápidas
[6] Confirmar            →  Cria a campanha + carrega a fila
                            Mostra: link público + QR + senha sugerida
```

Tudo num único dialog em etapas. CSV, eleição, indicados e contratados deixam de ser cards separados.

### B. Filtro automático por campanha no operador

Hoje `tele_list_contatos` devolve tudo. Vamos:

- Adicionar `campanha_id` ao login do operador (escolhe a fila ao entrar, ou recebe link já com `?fila=xxx`).
- A função passa a filtrar **só os contatos vinculados àquela campanha**.
- Operador vê só os nomes da fila atribuída — fim da confusão.

### C. "Fila ao vivo" vira painel por campanha

Em vez de lista achatada de contatos pendentes, mostra:

```text
┌─ Bairro Centro - 1ª rodada ───────────────────┐
│ 1.247 contatos · 312 ligados · 187 confirmados│
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 25%   │
│ [Abrir como operador] [Copiar link] [QR]      │
│ Operadores online: Ana, Carlos                │
└───────────────────────────────────────────────┘
```

Cada campanha vira um card com progresso, link pronto e quem está online.

### D. Atalho "Testar agora" (resolve seu bloqueio)

Botão **"Testar essa fila"** ao final do wizard → abre o portal do operador em nova aba, já logado com uma senha de teste, na campanha recém-criada. Você consegue validar em 1 clique sem precisar passar por login/operador/senha manualmente.

---

## Como ficam as telas

```text
TELEMARKETING ADMIN
├── Visão geral       (KPIs por campanha)
├── Filas ⭐          (cards de campanha + "Nova fila" botão grande)
├── Resultados
├── Relatórios
├── Operadores        (só cadastro; senha agora é por-campanha opcional)
└── Configurações
```

"Campanhas" e "Fila ao vivo" viram **uma aba só: Filas**.

---

## Detalhes técnicos (para referência)

- **Tabela `telemarketing_fila_itens`** (nova, opcional): vínculo `campanha_id ↔ contato (tabela+id)` para suportar mailings que misturam origens. Se não quisermos nova tabela, a campanha_id já existe em `telemarketing_contatos_avulsos` e `eleicao_indicados`; basta adicioná-la em `contratados`/`contratado_indicados` ou usar uma view de junção.
- **`tele_list_contatos`** ganha parâmetro `_campanha_id uuid` opcional. Quando preenchido, filtra `WHERE campanha_id = _campanha_id` em cada UNION.
- **`tele_operador_login`** retorna campanhas disponíveis pro operador escolher (ou se houver só 1 ativa, entra direto).
- **`tele_create_fila_wizard`** (nova RPC) — recebe `{ nome, origem, filtros, script, tags }` e cria a campanha + atribui os contatos numa única transação.
- **Senha de teste**: gerar JWT curto de 1h com `op=__teste__` + `campanha_id` embarcado, abrir `/telemarketing/{clientId}?token=...`.

---

## O que NÃO muda

- Estrutura de scoring de indicadores (já está pronta).
- Click-to-call, registro de resultado, telemarketing_call_log.
- Cadastro de operadores em si.

---

## Entregáveis

1. Wizard "Nova fila" em 6 passos na aba Filas.
2. Operador filtra por campanha automaticamente.
3. Painel "Filas" com cards de progresso por campanha.
4. Botão "Testar essa fila" gerando link/senha temporários.
5. Remoção dos cards duplicados (CSV solto, Designar Eleição solto).
