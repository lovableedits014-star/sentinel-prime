## O problema

Hoje o reenvio do fluxo de cadastro depende 100% da instância WhatsApp conectada da campanha. Quando a instância cai (e isso tem acontecido bastante), nenhuma das três mensagens do fluxo é entregue. Você quer poder mandar manualmente, **pelo seu próprio WhatsApp Web**, sem depender da instância.

## O que vai mudar (na visão do usuário)

No dropdown de 3 pontinhos de cada pessoa cadastrada (coordenador / líder / cabo), na página **Eleição**, abaixo das opções existentes vai aparecer um novo bloco:

```
📨 Enviar fluxo pelo MEU WhatsApp
   ↳ Para o Coordenador  (José da Silva · 67 9...)
   ↳ Para o Cadastrado   (nome · telefone)
   ↳ Para a Secretaria   (67 9...)
```

Cada item abre uma nova aba em `https://wa.me/<telefone>?text=<mensagem já pronta>`, usando o WhatsApp Web/celular do usuário logado. A mensagem já vem 100% formatada, igual à que a instância automática enviaria.

Itens são desabilitados (com tooltip explicando o porquê) quando não há destinatário válido:
- "Para o Coordenador" → desabilita se a pessoa for um coordenador (não tem coordenador acima) ou se não houver coordenador resolvido na região.
- "Para a Secretaria" → desabilita se `secretaria_telefone` não estiver configurado em Eleição → Configurações.
- "Para o Cadastrado" → desabilita só se a pessoa não tiver telefone.

## Regras de qual mensagem é enviada pra quem

As mensagens vêm exatamente dos mesmos templates já usados pela edge `eleicao-notify-novo-lider`, lidos da tabela `eleicao_notif_config` do cliente atual. Os placeholders `{nome}`, `{regiao}`, `{telefone}`, `{rua}`, `{numero}`, `{bairro}`, `{link_grupo}` são substituídos do mesmo jeito que a edge faz.

| Pessoa cadastrada | Para o Coordenador | Para o Cadastrado | Para a Secretaria |
|---|---|---|---|
| **Líder** | `template_coordenador` (vars do líder) | `template_lider` (vars do líder + link do grupo da região do líder) | `template_coordenador` (vars do líder) |
| **Cabo eleitoral** | `template_coordenador` (vars do cabo) | `template_cabo_boas_vindas` (vars do cabo + link do grupo) | `template_coordenador` (vars do cabo) |
| **Coordenador** | _(desabilitado — não tem coordenador acima)_ | `template_coordenador_boas_vindas` (vars dele + link do grupo da região dele) | `template_coordenador` (vars dele) |

Resolução do "Coordenador":
1. Se `pessoa.parent_id` aponta para um coordenador → usa esse (mesmo dono que registrou). 
2. Senão, se a pessoa tem região (Campo Grande), tenta o **coordenador favorito** da região (`is_favorito_regiao = true`). 
3. Senão, fallback: coordenador mais antigo da mesma região. 

Exatamente a mesma cadeia que a edge function já usa (`resolveCoord` em `eleicao-notify-novo-lider/index.ts`).

Resolução do `{link_grupo}`: lê `cfg.grupos_links[regiao]`; se a pessoa não tiver região, sobe pela cadeia `parent_id` (até 3 níveis) procurando uma, exatamente como na edge.

Resolução do `{regiao}` em texto: lê `eleicao_regioes.label` do cliente; fallback pelo dicionário fixo (`Centro`, `Segredo`, etc.); fallback final = `regiao.charAt(0).toUpperCase() + ...`.

## Como será implementado (técnico)

1. **Novo helper** `src/lib/eleicao-fluxo-cadastro.ts` que, dada uma `Pessoa` + `clientId`:
   - Faz `select *` em `eleicao_notif_config` (RLS já permite — quem está nessa tela é dono/team_member).
   - Resolve a região efetiva, o `regiaoLabel` (via `eleicao_regioes`), o `linkGrupo` e o coordenador-destino.
   - Aplica os templates com as mesmas vars da edge.
   - Retorna `{ coordenador, cadastrado, secretaria }`, cada um com `{ telefone, nome, mensagem, disabled, motivo }`.
   - 100% client-side: sem edge function nova, sem migration.

2. **Novo componente** `src/components/eleicao/EnviarFluxoMenu.tsx` que recebe a `Pessoa` e renderiza um sub-menu (`DropdownMenuSub` do shadcn) com os 3 itens. Cada item:
   - Mostra nome + telefone formatado do destinatário.
   - Quando clicado, abre `https://wa.me/<55…>?text=<encodeURIComponent(mensagem)>` em nova aba.
   - Mostra `Loader2` enquanto resolve o template (a primeira abertura faz 1–2 selects).
   - Cacheia a resolução por `pessoa.id` enquanto o menu está montado, então abrir várias vezes não refaz query.

3. **Integração no dropdown atual** em `src/pages/Eleicao.tsx` (`PessoaRow`):
   - Logo abaixo do `Editar` / `Abrir WhatsApp`, adicionar `<DropdownMenuSeparator />` + `<EnviarFluxoMenu pessoa={p} />`.
   - Aparece para coordenador, líder e cabo — só a opção "Para o Coordenador" desabilita quando for coordenador.

4. **Sem mudanças** em edge functions, migrations, ou na lógica automática atual. O envio automático pela instância continua funcionando do mesmo jeito; o novo botão é só uma alternativa manual.

## O que **não** vai mudar

- Nenhum envio via instância WhatsApp.
- Nenhum registro em `eleicao_notif_log` (é envio manual pelo próprio celular do usuário; não temos como confirmar entrega).
- Nenhum bloqueio por `cfg.envio_*_ativo` — esses flags governam o envio automático; o manual é uma fuga consciente do usuário.
- A edge `eleicao-notify-novo-lider` continua igual.

## Validação

Após implementar, testar com uma pessoa de cada tipo no preview:
1. Líder em Campo Grande → 3 opções habilitadas, mensagens com link do grupo da região.
2. Cabo sem região → "Para Coordenador" desabilitado se não houver favorito; texto do cadastrado usa `template_cabo_boas_vindas`.
3. Coordenador → "Para Coordenador" desabilitado; "Para o Cadastrado" usa `template_coordenador_boas_vindas`.
4. Cliente sem `secretaria_telefone` configurado → "Para Secretaria" desabilitado com tooltip.
