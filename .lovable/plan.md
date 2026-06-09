## Problema

Hoje cada operador abre a fila e começa do **mesmo primeiro contato** da lista. O `tele_claim_contato` existe (trava de 5 min), mas:

- Só dispara quando o operador **abre** o contato — os 5 já clicaram antes da trava aparecer.
- A lista é carregada uma vez e fica estática: operador B não vê em tempo real que o A travou alguém.
- O aviso é só um toast amarelo — nada impede o operador de ligar mesmo assim.
- Sem fila "próximo disponível": todos seguem a mesma ordem.

Resultado: com 5+ operadores simultâneos, várias pessoas recebem ligações repetidas em segundos.

## Solução: distribuição automática + trava forte + tempo real

### 1) RPC `tele_proximo_contato(_client_id, _nome, _senha, _campanha_id)`
Servidor escolhe e **já trava** o próximo contato disponível, em uma única transação atômica (`FOR UPDATE SKIP LOCKED`):

- Exclui quem já tem `ligacao_status` final (atendeu/recusou/etc.)
- Exclui quem está travado por outro operador (`expires_at > now()`)
- Exclui quem tem `proxima_tentativa_em > now()` (reagendado)
- Ordena por: pendentes primeiro → tentativas asc → criação asc
- Cria/renova a trava de 5 min para o operador que chamou
- Retorna o contato + dados de exibição

Isso elimina a corrida: dois operadores nunca recebem o mesmo registro.

### 2) Botão "Próximo contato" no painel do operador
- Substitui o `currentIndex` local pela chamada à RPC acima.
- Ao salvar uma ligação ou clicar "Pular", chama `tele_proximo_contato` de novo.
- Se a RPC devolver vazio: "Fila vazia — aguarde reagendamentos" + auto-retry a cada 30s.

### 3) Trava forte ao salvar
`tele_registrar_ligacao` passa a **rejeitar** o save se a trava ativa pertencer a outro operador (em vez de só sobrescrever). Mensagem: "Outro operador atendeu este contato há instantes". Evita gravação dupla mesmo se dois cliques colidirem.

### 4) Heartbeat + presença em tempo real
- Enquanto o operador está com um contato aberto, renova a trava a cada 60s (heartbeat).
- Canal Realtime do Supabase em `telemarketing_call_assignments`: a lista admin "Operadores online" mostra quem está atendendo quem, ao vivo.
- Ao fechar a aba / trocar de contato, libera a trava (`tele_release_contato`, já existe).

### 5) Anti-duplicação por telefone
Quando vários registros têm o mesmo telefone (ex.: mesma pessoa em `eleicao_pessoas` e `contratado_indicados`), `tele_proximo_contato` exclui também telefones travados nos últimos 5 min em **qualquer** tabela. Evita ligar pro mesmo número duas vezes por origens diferentes.

### 6) Painel admin "Ao vivo" (opcional, mas barato)
Pequeno card em `TelemarketingAdminFilas`:
- Quantos operadores online agora
- Lista: operador → contato atual → há quanto tempo
- Útil para você ver de longe se a distribuição está fluindo.

## Entregáveis técnicos

1. **Migration**: 
   - `tele_proximo_contato(...)` SECURITY DEFINER com `SELECT ... FOR UPDATE SKIP LOCKED`.
   - Atualizar `tele_registrar_ligacao` para validar dono da trava.
   - Índice em `telemarketing_call_assignments(client_id, expires_at)` se faltar.
2. **`src/pages/Telemarketing.tsx`**:
   - Trocar navegação por índice → fluxo "Próximo contato".
   - Heartbeat (`setInterval` 60s renovando claim).
   - Realtime subscribe em `telemarketing_call_assignments` para refletir mudanças.
3. **`TelemarketingAdminFilas.tsx`**: card "Operadores ao vivo".
4. **Validação**: abrir 3 abas anônimas como OPERADOR1/2/3 → cada um recebe contato diferente; ao salvar, próxima ligação também única.

## O que NÃO muda

- Estrutura das tabelas de contatos.
- Botão "Não atendeu (+1h)".
- Painéis de Resultados/Relatórios.
- Fluxo de criação de filas.
