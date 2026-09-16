// api/estoque.js
//
// Este arquivo roda DENTRO do Vercel (servidor), nunca no
// navegador. A única função dele é ser uma "ponte" segura até
// o Sentinel Database, que fica no seu PC atrás de um túnel
// Tailscale.
//
// Por que uma ponte, e não o navegador chamando o túnel direto?
//
//   1. SEGURANÇA
//      SENTINEL_API_KEY fica só aqui. Se ela virasse uma
//      variável VITE_*, ela seria embutida no JavaScript que
//      roda no navegador de QUALQUER pessoa que abrir o site —
//      visível em texto puro no código-fonte da página. Aqui
//      dentro, ela nunca sai do servidor da Vercel.
//
//   2. CORS
//      Como quem chama o túnel agora é o servidor da Vercel (e
//      não o navegador do usuário), não existe bloqueio de CORS
//      no meio do caminho.
//
// Variáveis de ambiente exigidas no painel do Vercel
// (Project → Settings → Environment Variables), SEM o prefixo
// VITE_ (senão elas também vazam pro navegador):
//
//   SENTINEL_DATABASE_URL = https://desktop-0jmamn4.tail94caa2.ts.net
//   SENTINEL_API_KEY      = SentinelDB-7f9K2mX4pQ8vL6zR
//
// Depois de criar/editar as variáveis, é preciso fazer um novo
// deploy — o Vercel não aplica variáveis novas em um deploy que
// já existe.

export default async function handler(req, res) {
  const baseUrl = process.env.SENTINEL_DATABASE_URL;
  const apiKey = process.env.SENTINEL_API_KEY;

  if (!baseUrl) {
    res.status(500).json({
      success: false,
      error:
        "SENTINEL_DATABASE_URL não está configurada nas variáveis de ambiente do Vercel.",
    });
    return;
  }

  if (req.method !== "GET" && req.method !== "PUT") {
    res.setHeader("Allow", "GET, PUT");
    res.status(405).json({
      success: false,
      error: `Método ${req.method} não permitido.`,
    });
    return;
  }

  const alvo = `${baseUrl.replace(/\/$/, "")}/api/estoque`;

  // Se o túnel/PC estiver desligado, não queremos que a
  // requisição fique pendurada pra sempre — cancelamos depois
  // de 10 segundos e respondemos com um erro claro.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const respostaRemota = await fetch(alvo, {
      method: req.method,

      headers: {
        "Content-Type": "application/json",

        /*
         * Mandamos a chave em dois formatos comuns
         * (Authorization: Bearer e x-api-key) para cobrir a
         * maioria dos jeitos de validar uma API key. Se o seu
         * Sentinel Database espera um cabeçalho diferente,
         * é só me avisar e eu ajusto aqui.
         */
        ...(apiKey
          ? {
              Authorization: `Bearer ${apiKey}`,
              "x-api-key": apiKey,
            }
          : {}),
      },

      body:
        req.method === "PUT"
          ? JSON.stringify(req.body)
          : undefined,

      signal: controller.signal,
    });

    clearTimeout(timeout);

    const texto = await respostaRemota.text();
    let dados = {};

    try {
      dados = texto ? JSON.parse(texto) : {};
    } catch {
      res.status(502).json({
        success: false,
        error:
          "O Sentinel Database respondeu algo que não é JSON válido.",
      });
      return;
    }

    res.status(respostaRemota.status).json(dados);
  } catch (error) {
    clearTimeout(timeout);

    const foiTimeout = error?.name === "AbortError";

    console.error(
      "Erro ao repassar requisição para o Sentinel Database:",
      error
    );

    res.status(502).json({
      success: false,
      error: foiTimeout
        ? "O Sentinel Database não respondeu a tempo (o PC ou o túnel Tailscale podem estar desligados)."
        : "Não foi possível conectar ao Sentinel Database. Verifique se o PC e o túnel Tailscale estão ativos.",
    });
  }
}