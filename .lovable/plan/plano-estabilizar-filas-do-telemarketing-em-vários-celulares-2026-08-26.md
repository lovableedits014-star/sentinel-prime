# Plano — estabilizar filas do telemarketing em vários celulares

## Diagnóstico confirmado

- O operador **Marcos está ativo**, sem bloqueio e atualmente vinculado de forma ativa à fila **ISA**.
- A fila ISA possui **873 contatos disponíveis** para ele neste momento. Portanto, quando a tela aparece vazia, o banco não está realmente sem contatos.
- A tela possui recargas secundárias que **ignoram erros da consulta**: se houver oscilação de internet, falha temporária ou resposta interrompida, ela transforma a falha em uma lista vazia e substitui os contatos que já estavam visíveis.
- O controle de contato em atendimento usa apenas o **nome do operador**. Dois celulares logados como Marcos são tratados como a mesma sessão, podendo renovar, reutilizar ou liberar a mesma trava sem distinguir qual aparelho iniciou o atendimento.
- Links antigos podem conter uma fila específica na URL. Já existe fallback no primeiro login, mas ele não é aplicado de forma uniforme em todas as recargas posteriores.
- A versão atual do service worker não armazena páginas ou arquivos em cache e tenta limpar caches antigos. Mesmo assim, não há hoje uma identificação visível da versão carregada em cada aparelho; portanto, versão antiga permanece uma hipótese a ser validada durante os testes, não a causa principal confirmada.

## Implementação

### 1. Tornar o carregamento resistente a falhas

- Centralizar todas as consultas da fila em uma única função de carregamento.
- Nunca substituir a lista atual por `[]` quando a consulta falhar.
- Exibir um estado explícito para cada situação:
  - carregando;
  - erro de conexão, com botão **Tentar novamente**;
  - operador sem fila liberada;
  - fila liberada, mas temporariamente sem contatos;
  - contatos aguardando horário de retorno.
- Aplicar retentativa curta para falhas transitórias e recarregar ao voltar para a aba ou recuperar a conexão.
- Manter o último contato válido na tela enquanto uma atualização estiver em andamento.

### 2. Corrigir acesso por fila e links antigos

- Validar no servidor quais filas estão ativas e liberadas para o operador antes de carregar contatos.
- Se o parâmetro `campanha` estiver inválido, inativo ou não autorizado, remover essa seleção e carregar automaticamente as filas válidas do operador.
- Usar o mesmo fallback no login, troca de campanha, atualização em tempo real, próximo contato e retorno após salvar.
- Mostrar no cabeçalho qual fila foi realmente carregada, evitando que um link antigo pareça estar apontando para a fila atual.

### 3. Separar sessões por aparelho

- Criar um identificador aleatório de sessão do telemarketing por aba/aparelho, sem guardar senha.
- Passar esse identificador às operações de reservar, renovar e liberar contato.
- Alterar as travas para pertencerem à combinação **operador + sessão**, impedindo que dois celulares com o mesmo login controlem acidentalmente o mesmo atendimento.
- Manter múltiplos acessos permitidos: cada aparelho receberá contatos diferentes.
- Expirar automaticamente sessões abandonadas pelo tempo de inatividade já usado nas travas.

### 4. Diagnóstico operacional

- Criar uma consulta segura que retorne somente contagens e motivos de indisponibilidade: filas autorizadas, contatos disponíveis, aguardando retorno, reservados por outras sessões e fila solicitada inválida.
- Registrar falhas técnicas de carregamento sem armazenar senha ou dados pessoais dos contatos.
- Exibir uma mensagem objetiva ao operador e um detalhe útil no painel administrativo, para diferenciar problema de internet, versão, permissão e fila vazia.

### 5. Controle de versão nos celulares

- Exibir discretamente a versão da aplicação na tela de login/rodapé do telemarketing.
- Ao detectar uma versão nova, atualizar os arquivos da aplicação sem apagar o trabalho que o operador está preenchendo.
- Manter uma ação administrativa de **Atualizar sistema neste aparelho**, que remove somente caches da aplicação e recarrega a versão atual.
- Não usar limpeza automática agressiva durante uma ligação em andamento.

## Validação

- Testar o mesmo operador simultaneamente em dois celulares e confirmar que recebem contatos diferentes.
- Testar operadores diferentes na mesma fila e em filas separadas.
- Simular internet instável e confirmar que a lista anterior não desaparece.
- Abrir links com fila válida, inativa, não autorizada e sem parâmetro.
- Validar atualização de versão em navegador comum e aplicação instalada na tela inicial.
- Conferir no banco que os contatos continuam disponíveis e que as reservas expiram corretamente após abandono.

## Detalhes técnicos

- Será necessária uma migração para adicionar o identificador da sessão às reservas e atualizar as funções RPC de próximo contato, claim, heartbeat e release.
- A autenticação do operador continuará separada do login administrativo; nenhuma senha será persistida no navegador ou em logs.
- A correção preservará a seleção explícita de operadores por fila já existente.
