import { createServer } from "node:http";
import { closeDatabase, withDatabase } from "./db.mjs";

const port = Number(process.env.PORT ?? 4000);
const allowedOrigin = process.env.FRONTEND_URL ?? "http://localhost:3000";
const MAX_BODY_SIZE = 50 * 1024 * 1024;

const JOB_COLUMNS = [
  ["order_number", "numeroPedido"],
  ["system_name", "sistema"],
  ["seller", "vendedor"],
  ["client", "cliente"],
  ["product", "produto"],
  ["material", "material"],
  ["size", "tamanho"],
  ["thickness", "espessura"],
  ["colors", "cores"],
  ["magnetic_stripe", "tarjaMagnetica"],
  ["magnetic_stripe_type", "tipoTarja"],
  ["chip_rfid", "chipRfid"],
  ["chip_type", "tipoChip"],
  ["infrared", "infrared"],
  ["infrared_color", "infraredCor"],
  ["finishing", "acabamento"],
  ["observations", "observacoes"],
];

function headers() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function sendJson(response, status, body) {
  response.writeHead(status, headers());
  response.end(JSON.stringify(body));
}

function errorBody(code, message, details = undefined) {
  return { error: { code, message, ...(details ? { details } : {}) } };
}

function parseId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        reject(Object.assign(new Error("Payload muito grande."), { code: "payload_too_large" }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        resolve(chunks.length === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(Object.assign(new Error("JSON inválido."), { code: "invalid_json" }));
      }
    });
    request.on("error", reject);
  });
}

function jobFromRow(row) {
  return {
    id: row.id,
    numeroPedido: row.order_number,
    sistema: row.system_name,
    vendedor: row.seller,
    cliente: row.client,
    produto: row.product,
    material: row.material,
    tamanho: row.size,
    espessura: row.thickness,
    cores: row.colors,
    tarjaMagnetica: row.magnetic_stripe,
    tipoTarja: row.magnetic_stripe_type,
    chipRfid: row.chip_rfid,
    tipoChip: row.chip_type,
    infrared: row.infrared,
    infraredCor: row.infrared_color,
    acabamento: row.finishing,
    observacoes: row.observations,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function faceFromRow(row) {
  return {
    id: row.id,
    side: row.side,
    imageName: row.image_name,
    format: row.format,
    imageWidth: row.image_width,
    imageHeight: row.image_height,
    previewDataUrl: row.preview_data_url,
    analysis: row.analysis,
    options: row.options,
    colors: row.colors,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getJob(pool, id) {
  const jobResult = await pool.query("SELECT * FROM jobs WHERE id = $1", [id]);
  if (jobResult.rowCount === 0) return null;
  const facesResult = await pool.query(
    "SELECT * FROM job_faces WHERE job_id = $1 ORDER BY CASE side WHEN 'frente' THEN 0 ELSE 1 END",
    [id],
  );
  const exportsResult = await pool.query(
    "SELECT id, export_type, file_name, mime_type, file_size, created_at FROM job_exports WHERE job_id = $1 ORDER BY created_at DESC",
    [id],
  );
  return {
    job: jobFromRow(jobResult.rows[0]),
    faces: facesResult.rows.map(faceFromRow),
    exports: exportsResult.rows,
  };
}

async function createJob(pool, payload) {
  const booleanKeys = new Set(["tarjaMagnetica", "chipRfid", "infrared"]);
  const values = JOB_COLUMNS.map(([, key]) =>
    payload[key] ?? (booleanKeys.has(key) ? false : ""),
  );
  const columns = JOB_COLUMNS.map(([column]) => column);
  const placeholders = values.map((_, index) => `$${index + 1}`);
  const result = await pool.query(
    `INSERT INTO jobs (${columns.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`,
    values,
  );
  return jobFromRow(result.rows[0]);
}

async function updateJob(pool, id, payload) {
  const entries = JOB_COLUMNS.filter(([, key]) => Object.hasOwn(payload, key));
  if (entries.length === 0) return getJob(pool, id);
  const values = entries.map(([, key]) => payload[key]);
  const assignments = entries.map(([column], index) => `${column} = $${index + 1}`);
  values.push(id);
  const result = await pool.query(
    `UPDATE jobs SET ${assignments.join(", ")}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
    values,
  );
  return result.rowCount === 0 ? null : jobFromRow(result.rows[0]);
}

function encodeCursor(row) {
  return Buffer.from(`${row.created_at.toISOString()}|${row.id}`).toString("base64url");
}

function decodeCursor(value) {
  try {
    const [createdAt, id] = Buffer.from(value, "base64url").toString("utf8").split("|");
    if (!createdAt || !parseId(id)) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

async function listJobs(pool, searchParams) {
  const requestedLimit = Number(searchParams.get("limit") ?? 25);
  const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, requestedLimit)) : 25;
  const cursor = searchParams.get("cursor") ? decodeCursor(searchParams.get("cursor")) : null;
  if (searchParams.get("cursor") && !cursor) {
    throw Object.assign(new Error("Cursor inválido."), { code: "invalid_cursor" });
  }
  const values = [];
  let where = "";
  if (cursor) {
    values.push(cursor.createdAt, cursor.id);
    where = "WHERE (created_at, id) < ($1::timestamptz, $2::uuid)";
  }
  values.push(limit + 1);
  const result = await pool.query(
    `SELECT * FROM jobs ${where} ORDER BY created_at DESC, id DESC LIMIT $${values.length}`,
    values,
  );
  const hasMore = result.rows.length > limit;
  const rows = result.rows.slice(0, limit);
  return {
    items: rows.map(jobFromRow),
    nextCursor: hasMore ? encodeCursor(rows[rows.length - 1]) : null,
  };
}

async function saveFace(pool, id, side, payload) {
  const result = await pool.query(
    `INSERT INTO job_faces
      (job_id, side, image_name, format, image_width, image_height, preview_data_url, analysis, options, colors)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb)
     ON CONFLICT (job_id, side) DO UPDATE SET
       image_name = EXCLUDED.image_name,
       format = EXCLUDED.format,
       image_width = EXCLUDED.image_width,
       image_height = EXCLUDED.image_height,
       preview_data_url = EXCLUDED.preview_data_url,
       analysis = EXCLUDED.analysis,
       options = EXCLUDED.options,
       colors = EXCLUDED.colors,
       updated_at = NOW()
     RETURNING *`,
    [
      id,
      side,
      payload.imageName ?? "",
      payload.format ?? "",
      Number(payload.imageWidth ?? 0),
      Number(payload.imageHeight ?? 0),
      payload.previewDataUrl ?? "",
      JSON.stringify(payload.analysis ?? {}),
      JSON.stringify(payload.options ?? {}),
      JSON.stringify(payload.colors ?? []),
    ],
  );
  return faceFromRow(result.rows[0]);
}

async function saveExport(pool, id, payload) {
  if (!payload.dataUrl?.startsWith("data:")) {
    throw Object.assign(new Error("dataUrl da exportação é obrigatório."), { code: "invalid_export" });
  }
  const match = payload.dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) {
    throw Object.assign(new Error("dataUrl da exportação é inválido."), { code: "invalid_export" });
  }
  const data = Buffer.from(match[2], "base64");
  const exportType = payload.exportType;
  if (!new Set(["pdf", "jpg"]).has(exportType)) {
    throw Object.assign(new Error("Tipo de exportação inválido."), { code: "invalid_export" });
  }
  const result = await pool.query(
    `INSERT INTO job_exports (job_id, export_type, file_name, mime_type, file_data, file_size)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, job_id, export_type, file_name, mime_type, file_size, created_at`,
    [id, exportType, payload.fileName ?? "exportacao", match[1], data, data.length],
  );
  return result.rows[0];
}

async function handle(request, response) {
  const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
  const parts = url.pathname.split("/").filter(Boolean);

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, { status: "ok", service: "croma-api" });
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/v1") {
    sendJson(response, 200, { name: "Croma Studio API", version: "v1" });
    return;
  }

  if (parts[0] !== "api" || parts[1] !== "v1") {
    sendJson(response, 404, errorBody("not_found", "Rota não encontrada."));
    return;
  }

  const isJobsCollection = parts.length === 3 && parts[2] === "jobs";
  if (request.method === "POST" && isJobsCollection) {
    const payload = await readBody(request);
    const job = await withDatabase((pool) => createJob(pool, payload));
    sendJson(response, 201, { job });
    return;
  }
  if (request.method === "GET" && isJobsCollection) {
    const result = await withDatabase((pool) => listJobs(pool, url.searchParams));
    sendJson(response, 200, result);
    return;
  }

  const id = parts[3];
  if (parts[2] !== "jobs" || !parseId(id)) {
    sendJson(response, 404, errorBody("not_found", "Pedido não encontrado."));
    return;
  }
  if (request.method === "GET" && parts.length === 4) {
    const result = await withDatabase((pool) => getJob(pool, id));
    if (!result) {
      sendJson(response, 404, errorBody("job_not_found", "Pedido não encontrado."));
      return;
    }
    sendJson(response, 200, result);
    return;
  }
  if (request.method === "PATCH" && parts.length === 4) {
    const payload = await readBody(request);
    const job = await withDatabase((pool) => updateJob(pool, id, payload));
    if (!job) {
      sendJson(response, 404, errorBody("job_not_found", "Pedido não encontrado."));
      return;
    }
    sendJson(response, 200, { job });
    return;
  }
  if (request.method === "DELETE" && parts.length === 4) {
    const deleted = await withDatabase(async (pool) => {
      const result = await pool.query("DELETE FROM jobs WHERE id = $1", [id]);
      return result.rowCount > 0;
    });
    if (!deleted) {
      sendJson(response, 404, errorBody("job_not_found", "Pedido não encontrado."));
      return;
    }
    response.writeHead(204, headers());
    response.end();
    return;
  }
  if (request.method === "PUT" && parts.length === 6 && parts[4] === "faces") {
    if (!new Set(["frente", "verso"]).has(parts[5])) {
      sendJson(response, 422, errorBody("invalid_side", "A face deve ser frente ou verso."));
      return;
    }
    const payload = await readBody(request);
    const face = await withDatabase((pool) => saveFace(pool, id, parts[5], payload));
    sendJson(response, 200, { face });
    return;
  }
  if (request.method === "POST" && parts.length === 5 && parts[4] === "exports") {
    const payload = await readBody(request);
    const exportRecord = await withDatabase((pool) => saveExport(pool, id, payload));
    sendJson(response, 201, { export: exportRecord });
    return;
  }

  sendJson(response, 404, errorBody("not_found", "Rota não encontrada."));
}

const server = createServer((request, response) => {
  if (request.method === "OPTIONS") {
    response.writeHead(204, headers());
    response.end();
    return;
  }
  handle(request, response).catch((error) => {
    const status = error.code === "database_not_configured" ? 503 : error.code === "payload_too_large" ? 413 : error.code === "invalid_json" || error.code === "invalid_cursor" ? 400 : 500;
    if (status >= 500) console.error(error);
    sendJson(response, status, errorBody(error.code ?? "internal_error", error.message ?? "Erro interno."));
  });
});

server.listen(port, () => {
  console.log(`Croma API listening on http://localhost:${port}`);
});

process.on("SIGINT", async () => {
  await closeDatabase();
  server.close();
});
