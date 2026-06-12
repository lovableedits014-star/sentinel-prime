## Problema

Hoje os 3 botões de acesso do coordenador (Enviar acesso por WhatsApp, Gerar link e copiar, Definir e enviar acesso) chamam a mesma edge function `eleicao-send-credentials` **sempre gerando uma senha nova** (`genPassword(10)`) e sobrescrevendo a senha do auth via `auth.admin.updateUserById`. Qualquer clique invalida o acesso atual.

Além disso, o menu tem 3 itens fazendo praticamente a mesma coisa, poluindo a interface, e o diálogo "Definir e enviar acesso" abre com senha aleatória pré-preenchida, estimulando sobrescrita acidental.

## Objetivo

1. **Não resetar senha por padrão** — só quando o admin explicitamente pedir.
2. **Senha-coringa padrão = `coringa15111`** (em vez de aleatória).
3. **Consolidar o menu** de 3 itens em **1 item único** com submenu, reduzindo poluição visual.

## Nova UX do dropdown (consolidação)

Em vez de 3 linhas separadas, **1 item raiz** com submenu:

```
🔑 Acesso ao portal  ▸
   ├─ 📱 Enviar por WhatsApp        (não mexe na senha)
   ├─ 📋 Copiar link de acesso       (não mexe na senha)
   ├─ ───────────────────────────
   └─ 🔁 Redefinir senha e enviar…   (abre diálogo, único caminho que reseta)
```

- As 2 primeiras opções são "não destrutivas" — usam a senha já cadastrada.
- A terceira é destrutiva e leva ao diálogo com `coringa15111` pré-preenchido (editável).
- Mesma lógica/itens aparecem na lista plana e no dialog de bulk, sem duplicar código (extrai-se um `<AcessoPortalMenu pessoa={p} onSend={…} onCredentials={…} />`).

## Mudanças técnicas

### 1. Edge function `supabase/functions/eleicao-send-credentials/index.ts`

- Aceitar nova flag `reset_password: boolean` (default `false`) no schema/body.
- Lógica de senha:
  - Se `reset_password === true` **ou** se a conta ainda não existe: usar `passwordInput || "coringa15111"`.
  - Caso contrário (usuário já existe e `reset_password === false`): **não enviar `password` no `updateUserById`** — atualizar só `email`/`email_confirm`/`user_metadata`. Retornar `password: null` no payload.
- Mensagem WhatsApp:
  - Com senha → mantém "🔑 Senha: …".
  - Sem senha → "🔑 Use a senha já cadastrada anteriormente."

### 2. `src/pages/Eleicao.tsx`

- `sendCredentials(p, channel, options)`: incluir `reset_password: !!options?.password` no body. WhatsApp/Copiar continuam sem `options` → não resetam. `saveCred()` continua passando senha → reseta.
- `openCred(p)`: trocar `setCredPassword(genLocalPassword())` por `setCredPassword("coringa15111")`.
- Bloco `credResult`: quando `password` vier `null`, ocultar campo de senha e mostrar nota "Senha atual mantida".
- Toasts: "Link copiado (senha atual mantida)" / "Acesso enviado por WhatsApp (senha atual mantida)".

### 3. Consolidação do menu

- Criar componente local `AcessoPortalSubmenu` em `Eleicao.tsx` usando `DropdownMenuSub` + `DropdownMenuSubTrigger` + `DropdownMenuSubContent` do shadcn.
- Substituir os 3 `DropdownMenuItem` atuais (linhas 1606–1615) por esse submenu.
- Mesma substituição no item equivalente da `ListaPlana` se existir.
- Manter "Enviar boas-vindas (grupo)" como item separado (intenção distinta).

## Critério de aceitação

1. Menu do coordenador mostra **1 linha "Acesso ao portal"** com submenu de 3 opções (WhatsApp, Copiar link, Redefinir senha).
2. WhatsApp e Copiar link **não alteram** a senha em coordenador que já tem acesso (login antigo segue válido); confirmado por toast "senha atual mantida" e payload com `password: null`.
3. Redefinir senha abre diálogo pré-preenchido com `coringa15111`; ao confirmar, sobrescreve e envia.
4. Coordenador novo (sem `user_id`): qualquer das 3 ações cria conta com `coringa15111` e devolve a senha na mensagem.
