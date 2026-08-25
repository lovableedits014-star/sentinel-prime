# Fazer as pessoas confirmarem a missão

Hoje a página da missão mostra os botões dos links e, logo abaixo, um botão discreto "Já realizei esta missão". Quem clica no link sai para o Facebook/Instagram e, quando volta (ou nem volta), não vê mais nada chamando para confirmar — por isso a maioria fica só como "abriu".

## O que muda na tela pública (missão)

1. **Passo a passo visível**
   - "Passo 1 — Abra a publicação" (os links) e "Passo 2 — Confirme que você cumpriu".
   - Cada link clicado ganha um selo verde de concluído, para a pessoa entender que ainda falta o passo 2.

2. **Barra fixa de confirmação no rodapé**
   - Assim que a pessoa clica em qualquer link, aparece uma barra fixa no pé da tela (mobile-first), grande, verde, escrito **"Confirmar que cumpri a missão"**. Ela acompanha a rolagem e não sai da vista até confirmar.

3. **Aviso ao voltar do Facebook/Instagram**
   - Quando a pessoa retorna para a aba/navegador (evento de visibilidade/foco), a página mostra um destaque animado + um lembrete: "Falta só confirmar!" com o botão em foco automático.

4. **Botão de confirmação muito mais forte**
   - Texto claro: "✅ Confirmar que cumpri" (em vez de "Já realizei esta missão"), altura maior, cor de destaque, animação de pulso suave enquanto não confirmado.
   - Aviso vermelho suave enquanto não confirmado: "Sua participação só conta depois de confirmar."

5. **Tela de sucesso comemorativa**
   - Após confirmar: bloco verde grande, nome da pessoa, "Participação registrada" e o botão desaparece (sem chance de dúvida se funcionou).

6. **Não perder quem fechou a página**
   - A intenção de confirmação fica salva localmente por missão: se a pessoa reabrir o link e já tinha confirmado, vê o estado concluído; se abriu e não confirmou, ao reabrir já cai direto na barra de confirmação com o lembrete.

## O que muda na gestão (dashboard de check-in)

7. **Alerta "Abriram e não confirmaram"**
   - Novo bloco de alerta destacado, com contagem e lista dessas pessoas, e botão de WhatsApp com mensagem pronta: "Vi que você abriu o link da missão X — falta só clicar em Confirmar. Link: …".
   - Ação em lote: copiar todos os telefones / abrir cobranças uma a uma.

8. **KPI novo**
   - Card "Abriu sem confirmar" ao lado dos existentes, para medir a queda entre abertura e confirmação.

## Detalhes técnicos

- `src/pages/MissaoPublica.tsx`: estado `clickedLinks: Set<string>`, barra fixa (`fixed bottom-0`) condicional, listener `visibilitychange`/`focus` para o lembrete de retorno, `localStorage` por `missionId` guardando "clicou" e "confirmou", reordenação em passos, novos textos/estilos.
- Sem mudança de banco: continuamos usando os eventos `open`, `click_*` e `declared_done` já existentes em `mission_events`.
- `src/components/engagement/MissionCheckinAlerts.tsx`: nova seção derivada das linhas com status `abriu` (abriu mas sem `declared_done`), com links `wa.me` usando `toWhatsAppBR`.
- `src/components/engagement/MissionCheckinDashboard.tsx`: novo KPI "Abriu sem confirmar" (já existe o cálculo de `abriu`, só falta expor com o texto e destaque corretos).
