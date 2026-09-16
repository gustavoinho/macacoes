const DATABASE_URL = (process.env.SENTINEL_DATABASE_URL || "").replace(/\/$/, "");
const API_KEY = process.env.SENTINEL_API_KEY;

async function databaseRequest(endpoint, options = {}) {
  if (!DATABASE_URL) {
    throw new Error("SENTINEL_DATABASE_URL não configurada.");
  }

  if (!API_KEY) {
    throw new Error("SENTINEL_API_KEY não configurada.");
  }

  const response = await fetch(`${DATABASE_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": API_KEY,
      ...(options.headers || {}),
    },
  });

  const text = await response.text();

  let data;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      `Resposta inválida do Sentinel Database: ${text}`
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.error ||
      `Sentinel Database respondeu HTTP ${response.status}`
    );
  }

  return data;
}

function extractItems(result) {
  if (!result) {
    return [];
  }

  /*
   * O Sentinel pode retornar:
   *
   * {
   *   "records": [...]
   * }
   *
   * ou diretamente:
   *
   * [...]
   */

  const records = Array.isArray(result)
    ? result
    : Array.isArray(result.records)
      ? result.records
      : [];

  const items = [];

  for (const record of records) {
    if (!record) {
      continue;
    }

    let data = record.data;

    /*
     * O campo data pode vir como JSON string.
     */
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        continue;
      }
    }

    if (data && typeof data === "object") {
      items.push(data);
    }
  }

  return items;
}

export default async (request) => {
  try {
    /*
     * =========================
     * GET
     * =========================
     *
     * Busca tudo do Sentinel Database.
     */
    if (request.method === "GET") {
      const result = await databaseRequest("/api/records");

      const items = extractItems(result);

      console.log(
        `Sentinel Database retornou ${items.length} itens.`
      );

      return new Response(
        JSON.stringify({
          success: true,
          items,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          },
        }
      );
    }

    /*
     * =========================
     * PUT
     * =========================
     *
     * Salva o snapshot completo do estoque.
     */
    if (request.method === "PUT") {
      const body = await request.json();

      const items = body?.items;

      if (!Array.isArray(items)) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "O campo 'items' precisa ser uma lista.",
          }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
            },
          }
        );
      }

      /*
       * Primeiro buscamos os registros atuais.
       */
      const current = await databaseRequest("/api/records");

      const records = Array.isArray(current)
        ? current
        : Array.isArray(current?.records)
          ? current.records
          : [];

      /*
       * Apaga os registros antigos.
       */
      for (const record of records) {
        if (record?.id != null) {
          await databaseRequest(
            `/api/records/${encodeURIComponent(record.id)}`,
            {
              method: "DELETE",
            }
          );
        }
      }

      /*
       * Grava os registros novos.
       */
      for (const item of items) {
        await databaseRequest("/api/records", {
          method: "POST",
          body: JSON.stringify({
            data: JSON.stringify(item),
          }),
        });
      }

      console.log(
        `Sentinel Database recebeu ${items.length} itens.`
      );

      return new Response(
        JSON.stringify({
          success: true,
          count: items.length,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    /*
     * =========================
     * OUTROS MÉTODOS
     * =========================
     */
    return new Response(
      JSON.stringify({
        success: false,
        error: "Método não permitido.",
      }),
      {
        status: 405,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

  } catch (error) {
    console.error(
      "Erro na Function estoque:",
      error
    );

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Erro interno.",
      }),
      {
        status: 502,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
};