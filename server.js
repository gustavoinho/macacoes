import express from "express";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.join(__dirname, ".env"),
});

const app = express();

const PORT = Number(
  process.env.PORT || 3000
);

const DATABASE_URL =
  process.env.SENTINEL_DATABASE_URL ||
  "http://127.0.0.1:5000";

const API_KEY =
  process.env.SENTINEL_API_KEY;


if (!API_KEY) {

  console.error(
    "ERRO: SENTINEL_API_KEY não foi definida."
  );

  process.exit(1);
}


app.use(
  express.json({
    limit: "10mb",
  })
);


// ============================================================
// COMUNICAÇÃO COM SENTINEL DATABASE
// ============================================================

async function databaseRequest(
  endpoint,
  options = {}
) {

  const response = await fetch(
    `${DATABASE_URL}${endpoint}`,
    {
      ...options,

      headers: {
        "Content-Type": "application/json",

        "X-API-Key": API_KEY,

        ...(options.headers || {}),
      },
    }
  );


  const text = await response.text();

  let data;

  try {

    data = text
      ? JSON.parse(text)
      : {};

  } catch {

    data = {
      raw: text,
    };
  }


  if (!response.ok) {

    throw new Error(
      data?.error ||
      `Sentinel Database respondeu HTTP ${response.status}`
    );
  }


  return data;
}


// ============================================================
// NORMALIZAR REGISTRO
// ============================================================

function normalizeRecord(record) {

  if (
    !record ||
    typeof record !== "object"
  ) {
    return null;
  }


  let data = record.data;


  if (typeof data === "string") {

    try {

      data = JSON.parse(data);

    } catch {

      return null;
    }
  }


  if (
    !data ||
    typeof data !== "object"
  ) {
    return null;
  }


  return data;
}


// ============================================================
// GET ESTOQUE
// ============================================================

app.get(
  "/api/estoque",
  async (_req, res) => {

    try {

      const result =
        await databaseRequest(
          "/api/records"
        );


      const records =
        Array.isArray(result?.records)
          ? result.records
          : [];


      const items =
        records
          .map(normalizeRecord)
          .filter(Boolean);


      res.json({
        success: true,
        items,
      });


    } catch (error) {

      console.error(
        "GET /api/estoque:",
        error
      );


      res.status(502).json({
        success: false,
        error:
          "Sentinel Database indisponível.",
      });
    }
  }
);


// ============================================================
// SALVAR ESTOQUE
// ============================================================

app.put(
  "/api/estoque",
  async (req, res) => {

    const items = req.body?.items;


    if (!Array.isArray(items)) {

      return res.status(400).json({

        success: false,

        error:
          "O campo 'items' precisa ser uma lista.",
      });
    }


    try {

      // Pega os registros atuais.

      const current =
        await databaseRequest(
          "/api/records"
        );


      const records =
        Array.isArray(current?.records)
          ? current.records
          : [];


      // Remove registros antigos.

      for (const record of records) {

        if (
          record?.id !== undefined &&
          record?.id !== null
        ) {

          await databaseRequest(
            `/api/records/${encodeURIComponent(
              record.id
            )}`,
            {
              method: "DELETE",
            }
          );
        }
      }


      // Grava os novos.

      for (const item of items) {

        await databaseRequest(
          "/api/records",
          {
            method: "POST",

            body: JSON.stringify({
              data: JSON.stringify(item),
            }),
          }
        );
      }


      res.json({

        success: true,

        count: items.length,
      });


    } catch (error) {

      console.error(
        "PUT /api/estoque:",
        error
      );


      res.status(502).json({

        success: false,

        error:
          "Não foi possível salvar no Sentinel Database.",
      });
    }
  }
);


// ============================================================
// HEALTH
// ============================================================

app.get(
  "/api/health",
  async (_req, res) => {

    try {

      await databaseRequest(
        "/api/records"
      );


      res.json({

        success: true,

        databaseOnline: true,
      });


    } catch {

      res.status(503).json({

        success: false,

        databaseOnline: false,
      });
    }
  }
);


// ============================================================
// SERVIR O REACT
// ============================================================

const distPath =
  path.join(__dirname, "dist");


app.use(
  express.static(distPath)
);


app.get(
  "/{*splat}",
  (_req, res) => {

    res.sendFile(
      path.join(
        distPath,
        "index.html"
      )
    );
  }
);


// ============================================================
// INICIAR
// ============================================================

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `Estoque App online na porta ${PORT}`
    );

    console.log(
      `Sentinel Database: ${DATABASE_URL}`
    );
  }
);