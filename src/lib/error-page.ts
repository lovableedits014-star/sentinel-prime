export function renderErrorPage() {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sentinelle — erro temporário</title>
    <style>
      :root { color-scheme: dark; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #0f172a;
        color: #f8fafc;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main { width: min(92vw, 440px); text-align: center; }
      h1 { margin: 0 0 10px; font-size: 24px; line-height: 1.2; }
      p { margin: 0; color: #cbd5e1; line-height: 1.5; }
      .actions { margin-top: 24px; display: flex; justify-content: center; gap: 12px; flex-wrap: wrap; }
      button, a {
        border: 0;
        border-radius: 8px;
        padding: 10px 14px;
        font: 700 14px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        text-decoration: none;
        cursor: pointer;
      }
      button { background: #22c55e; color: #052e16; }
      a { background: #1e293b; color: #f8fafc; }
    </style>
  </head>
  <body>
    <main>
      <h1>Erro temporário ao abrir o sistema</h1>
      <p>Recarregue a página. Se continuar, o erro técnico já ficará registrado para análise.</p>
      <div class="actions">
        <button onclick="location.reload()">Recarregar</button>
        <a href="/">Ir para o início</a>
      </div>
    </main>
  </body>
</html>`;
}