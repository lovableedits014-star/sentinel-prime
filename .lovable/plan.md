## Objetivo

Quando um novo **Líder** for cadastrado na aba Eleição, disparar 3 mensagens automáticas via WhatsApp e melhorar o cadastro do endereço.

---

## 1. Endereço estruturado (rua / número / bairro)

No formulário "Novo cadastro", substituir o campo único `Endereço *` por 3 campos:

```text
[ Rua *               ] [ Nº       ]
[ Bairro *                         ]
```

- Banco: adicionar colunas `rua`, `numero`, `bairro` na tabela `eleicao_pessoas` (mantém `endereco` para compatibilidade — preenchido automaticamente concatenando "Rua, Nº – Bairro").
- Cadastros antigos continuam funcionando (campos novos ficam vazios; o `endereco` legado segue exibido).
- Pequenos ajustes em telas que mostram endereço para usar bairro/rua quando disponíveis.

---

## 2. Nova aba "Configurações" dentro de Eleição

Adicionar 4ª aba ao lado de Cadastros / Pendentes / Custos:

**Configurações de notificações**
- Telefone da **Secretaria** (recebe cópia de todo cadastro de líder)
- **Mensagem para o líder cadastrado** (texto editável, com placeholders `{nome}`, `{regiao}`, `{link_grupo}`)
- **Mensagem para coordenador/secretaria** (texto editável, com placeholders `{nome}`, `{regiao}`, `{telefone}`, `{rua}`, `{bairro}`)
- Toggle "Disparar automaticamente ao cadastrar líder" (liga/desliga o fluxo)

**Links dos grupos por região** (uma linha por região de Campo Grande):

```text
Centro          [ https://chat.whatsapp.com/...  ]
Segredo         [ https://chat.whatsapp.com/...  ]
Prosa           [ https://chat.whatsapp.com/...  ]
Bandeira        [ ...                            ]
Anhanduizinho   [ ...                            ]
Lagoa           [ ...                            ]
Imbirussu       [ ...                            ]
Moreninha       [ ...                            ]
```

Banco: nova tabela `eleicao_notif_config` (1 linha por client) com `secretaria_telefone`, `auto_enviar`, `template_coordenador`, `template_lider`, `grupos_links jsonb` (mapa região→link). RLS por client_id, igual às outras.

---

## 3. Disparo automático ao cadastrar Líder

Após `INSERT` bem-sucedido com `tipo = 'lider'` e `auto_enviar = true`, dispara em background (sem travar o "Cadastrado!"):

1. **Para o Coordenador da região** (busca o coordenador com mesma `regiao` no escopo Campo Grande — usa o `parent_id` se existir, senão o primeiro coordenador da região):
   > Foi adicionado novo líder na região: **Centro**
   > Nome: João da Silva
   > Telefone: (67) 99999-0000
   > Rua: Av. Afonso Pena, 1234
   > Bairro: Centro

2. **Para a Secretaria** (telefone configurado): mesma mensagem acima.

3. **Para o Líder cadastrado**:
   > Olá João! Você foi cadastrado como líder na região **Centro**.
   > Entre no grupo da região: https://chat.whatsapp.com/xxxx

Mostra um toast no fim: "Notificações enviadas: coordenador ✓, secretaria ✓, líder ✓" (ou avisa quem falhou — ex.: região sem coordenador, sem link de grupo, sem telefone de secretaria).

---

## Detalhes técnicos

- Reusa o mesmo mecanismo de envio do `eleicao-send-credentials` (UAZAPI/WhatsApp já configurado por client). Cria uma server function `eleicao-notify-novo-lider` (ou estende a existente) que recebe `pessoa_id` e dispara as 3 mensagens server-side, usando os templates da `eleicao_notif_config`.
- Idempotência: chamada feita apenas no caminho de criação (não em edição).
- Validações: se faltar config, ainda salva o cadastro e mostra aviso "configure as notificações em Configurações".
- Migração de dados antigos: `endereco` continua válido; novos campos só preenchidos para cadastros novos/editados.

---

## Escopo desta entrega

- ✅ Apenas para `tipo = 'lider'` (não dispara para coordenador/cabo).
- ✅ Apenas Campo Grande (regiões). Para Interior (cidade), o disparo fica desativado nesta fase — pode ser estendido depois se quiser.