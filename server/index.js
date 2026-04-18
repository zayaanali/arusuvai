require("dotenv").config();

const express = require("express");
const OpenAI = require("openai");
const path = require("path");
const {
  run,
  get,
  all,
  initDb,
  normalizeName,
  todayPlusDays,
} = require("./db");

const app = express();
const port = Number(process.env.PORT || 8000);
const host = process.env.HOST || "0.0.0.0";
const model = process.env.OPENROUTER_MODEL || "openai/gpt-4.1-mini";
const fallbackModel = process.env.OPENROUTER_FALLBACK_MODEL || "";
const openai = process.env.OPENROUTER_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        ...(process.env.OPENROUTER_SITE_URL ? { "HTTP-Referer": process.env.OPENROUTER_SITE_URL } : {}),
        ...(process.env.OPENROUTER_APP_NAME ? { "X-Title": process.env.OPENROUTER_APP_NAME } : {}),
      },
    })
  : null;

app.use(express.json());
app.use(express.static(path.join(process.cwd(), "public")));

function toPantryRead(row) {
  return {
    id: row.id,
    name: row.name,
    quantity: row.quantity,
    unit: row.unit,
    category: row.category,
    expires_at: row.expires_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function badRequest(res, message) {
  return res.status(400).json({ error: message });
}

async function requestAiPlan(message, selectedModel) {
  return openai.chat.completions.create({
    model: selectedModel,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "You are Pantry Manager AI orchestrator.",
          "Interpret user text and return JSON only.",
          "Schema:",
          "{",
          '  "intent": "add_pantry|remove_pantry|list_pantry|clear_pantry|reply",',
          '  "items": [{"name":"string","quantity":number|null,"unit":"string|null","category":"string|null","expires_at":"YYYY-MM-DD|null"}],',
          '  "names": ["string"],',
          '  "reply": "string"',
          "}",
          "Rules:",
          "- If user asks to add pantry items, use intent=add_pantry with items.",
          "- If user asks to remove/delete pantry items, use intent=remove_pantry with names.",
          "- If user asks to list/show pantry, use intent=list_pantry.",
          "- If user asks to clear all pantry, use intent=clear_pantry.",
          "- Otherwise use intent=reply with concise helpful text.",
        ].join("\n"),
      },
      {
        role: "user",
        content: message,
      },
    ],
  });
}

function parseCsvList(raw) {
  return String(raw || "")
    .split(",")
    .map((x) => normalizeName(x))
    .filter(Boolean);
}

async function upsertPantryItem({ name, quantity = 1, unit = null, category = null, expiresAt = null }) {
  const normalizedName = normalizeName(name);
  if (!normalizedName) return null;

  const qty = Number(quantity);
  const safeQuantity = Number.isNaN(qty) ? 1 : qty;
  const now = new Date().toISOString();
  const safeUnit = normalizeName(unit || "") || "unit";
  const safeCategory = normalizeName(category || "") || "uncategorized";

  const existing = await get("SELECT * FROM pantry_items WHERE name = ?", [normalizedName]);
  if (existing) {
    await run(
      `UPDATE pantry_items
       SET quantity = quantity + ?,
           unit = ?,
           category = ?,
           expires_at = ?,
           updated_at = ?
       WHERE id = ?`,
      [safeQuantity, safeUnit, safeCategory, expiresAt || null, now, existing.id]
    );
    return get("SELECT * FROM pantry_items WHERE id = ?", [existing.id]);
  }

  const insert = await run(
    `INSERT INTO pantry_items (name, quantity, unit, category, expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [normalizedName, safeQuantity, safeUnit, safeCategory, expiresAt || null, now, now]
  );
  return get("SELECT * FROM pantry_items WHERE id = ?", [insert.id]);
}

async function removePantryByNames(names) {
  const normalized = Array.from(new Set((names || []).map((n) => normalizeName(n)).filter(Boolean)));
  let removed = 0;
  for (const name of normalized) {
    const result = await run("DELETE FROM pantry_items WHERE name = ?", [name]);
    removed += Number(result?.changes || 0);
  }
  return removed;
}

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    version: process.env.APP_VERSION || "1.0.0",
    environment: process.env.NODE_ENV || "development",
  });
});

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    version: process.env.APP_VERSION || "1.0.0",
    environment: process.env.NODE_ENV || "development",
  });
});

app.post("/api/ai/chat", async (req, res, next) => {
  try {
    const message = String(req.body?.message || "").trim();
    if (!message) return badRequest(res, "message is required");
    if (!openai) return res.status(500).json({ error: "OPENROUTER_API_KEY is not set" });

    let response;
    try {
      response = await requestAiPlan(message, model);
    } catch (primaryErr) {
      const isProviderUnavailable =
        primaryErr?.status === 502 ||
        primaryErr?.status === 503 ||
        primaryErr?.status === 504 ||
        /provider returned error/i.test(String(primaryErr?.message || ""));
      const canFallback = Boolean(fallbackModel && fallbackModel !== model);
      if (!(isProviderUnavailable && canFallback)) {
        throw primaryErr;
      }
      response = await requestAiPlan(message, fallbackModel);
    }

    const raw = response.choices?.[0]?.message?.content || "{}";
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { intent: "reply", reply: "I could not parse that request. Please rephrase." };
    }

    const intent = String(parsed?.intent || "reply");
    if (intent === "add_pantry") {
      const items = Array.isArray(parsed?.items) ? parsed.items : [];
      if (!items.length) {
        return res.json({ reply: "I did not find items to add. Try: add eggs, milk.", refresh_pantry: false });
      }
      const added = [];
      for (const item of items) {
        const created = await upsertPantryItem({
          name: item?.name,
          quantity: item?.quantity == null ? 1 : item.quantity,
          unit: item?.unit || null,
          category: item?.category || null,
          expiresAt: item?.expires_at || null,
        });
        if (created?.name) added.push(created.name);
      }
      return res.json({
        reply: added.length ? `Added to pantry: ${added.join(", ")}.` : "No valid items were added.",
        refresh_pantry: true,
      });
    }

    if (intent === "remove_pantry") {
      let names = Array.isArray(parsed?.names) ? parsed.names : [];
      if (!names.length && typeof message === "string") {
        const maybe = message.replace(/^rm\b|^remove\b|^delete\b/i, "").trim();
        names = parseCsvList(maybe);
      }
      const removed = await removePantryByNames(names);
      return res.json({
        reply: removed ? `Removed ${removed} pantry item(s).` : "No matching pantry items found to remove.",
        refresh_pantry: true,
      });
    }

    if (intent === "list_pantry") {
      const rows = await all("SELECT * FROM pantry_items ORDER BY name");
      const names = rows.map((r) => r.name);
      return res.json({
        reply: names.length ? `Pantry items: ${names.join(", ")}.` : "Pantry is empty.",
        refresh_pantry: true,
      });
    }

    if (intent === "clear_pantry") {
      const result = await run("DELETE FROM pantry_items");
      return res.json({
        reply: `Pantry cleared. Deleted ${Number(result?.changes || 0)} item(s).`,
        refresh_pantry: true,
      });
    }

    return res.json({
      reply: String(parsed?.reply || "Done."),
      refresh_pantry: false,
    });
  } catch (err) {
    if (err && (err.code === "insufficient_quota" || err.status === 429)) {
      return res.status(429).json({
        error:
          "OpenRouter quota/rate limit exceeded. Check OpenRouter credits, limits, and model availability.",
      });
    }
    if (err && err.status === 401) {
      return res.status(401).json({ error: "OpenRouter authentication failed. Check OPENROUTER_API_KEY." });
    }
    if (err && err.status === 403) {
      return res.status(403).json({ error: "OpenRouter access denied for this model or account." });
    }
    if (err && (err.status === 502 || err.status === 503 || err.status === 504)) {
      return res.status(503).json({
        error:
          "AI provider is temporarily unavailable. Retry in a few seconds, or set OPENROUTER_FALLBACK_MODEL in .env.",
      });
    }
    return next(err);
  }
});

app.get("/api/pantry", async (req, res, next) => {
  try {
    const category = req.query.category ? normalizeName(req.query.category) : null;
    const expiringWithin = req.query.expiring_within_days;

    let sql = "SELECT * FROM pantry_items";
    const where = [];
    const params = [];

    if (category) {
      where.push("category = ?");
      params.push(category);
    }

    if (expiringWithin !== undefined) {
      const days = Number(expiringWithin);
      if (Number.isNaN(days) || days < 0) return badRequest(res, "expiring_within_days must be >= 0");
      where.push("expires_at IS NOT NULL AND expires_at <= ?");
      params.push(todayPlusDays(days));
    }

    if (where.length) sql += ` WHERE ${where.join(" AND ")}`;
    sql += " ORDER BY name";

    const rows = await all(sql, params);
    res.json(rows.map(toPantryRead));
  } catch (err) {
    next(err);
  }
});

app.get("/api/pantry/expiring", async (req, res, next) => {
  try {
    const days = Number(req.query.days || 7);
    if (Number.isNaN(days) || days < 0) return badRequest(res, "days must be >= 0");

    const rows = await all(
      `SELECT * FROM pantry_items WHERE expires_at IS NOT NULL AND expires_at <= ? ORDER BY expires_at ASC`,
      [todayPlusDays(days)]
    );
    res.json(rows.map(toPantryRead));
  } catch (err) {
    next(err);
  }
});

app.post("/api/pantry", async (req, res, next) => {
  try {
    const name = normalizeName(req.body?.name);
    if (!name) return badRequest(res, "name is required");

    const quantity = req.body?.quantity == null ? 1 : Number(req.body.quantity);
    if (Number.isNaN(quantity)) return badRequest(res, "quantity must be a number");

    const now = new Date().toISOString();
    const unit = normalizeName(req.body?.unit || "") || "unit";
    const category = normalizeName(req.body?.category || "") || "uncategorized";
    const expiresAt = req.body?.expires_at || null;

    const existing = await get("SELECT * FROM pantry_items WHERE name = ?", [name]);
    if (existing) {
      await run(
        `UPDATE pantry_items
         SET quantity = quantity + ?,
             unit = ?,
             category = ?,
             expires_at = ?,
             updated_at = ?
         WHERE id = ?`,
        [quantity, unit, category, expiresAt, now, existing.id]
      );
      const updated = await get("SELECT * FROM pantry_items WHERE id = ?", [existing.id]);
      return res.json(toPantryRead(updated));
    }

    const insert = await run(
      `INSERT INTO pantry_items (name, quantity, unit, category, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, quantity, unit, category, expiresAt, now, now]
    );
    const created = await get("SELECT * FROM pantry_items WHERE id = ?", [insert.id]);
    res.status(201).json(toPantryRead(created));
  } catch (err) {
    next(err);
  }
});

app.patch("/api/pantry/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await get("SELECT * FROM pantry_items WHERE id = ?", [id]);
    if (!existing) return res.status(404).json({ error: "Pantry item not found" });

    const name = req.body?.name ? normalizeName(req.body.name) : existing.name;
    const quantity = req.body?.quantity == null ? existing.quantity : Number(req.body.quantity);
    const unit = req.body?.unit == null ? existing.unit : normalizeName(req.body.unit) || "unit";
    const category =
      req.body?.category == null ? existing.category : normalizeName(req.body.category) || "uncategorized";
    const expiresAt = req.body?.expires_at === undefined ? existing.expires_at : req.body.expires_at;

    if (!name) return badRequest(res, "name cannot be empty");
    if (Number.isNaN(quantity)) return badRequest(res, "quantity must be a number");

    const duplicate = await get("SELECT id FROM pantry_items WHERE name = ? AND id != ?", [name, id]);
    if (duplicate) return res.status(409).json({ error: "Pantry item with this name already exists" });

    await run(
      `UPDATE pantry_items
       SET name = ?, quantity = ?, unit = ?, category = ?, expires_at = ?, updated_at = ?
       WHERE id = ?`,
      [name, quantity, unit, category, expiresAt, new Date().toISOString(), id]
    );

    const updated = await get("SELECT * FROM pantry_items WHERE id = ?", [id]);
    res.json(toPantryRead(updated));
  } catch (err) {
    next(err);
  }
});

app.delete("/api/pantry/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const result = await run("DELETE FROM pantry_items WHERE id = ?", [id]);
    if (!result.changes) return res.status(404).json({ error: "Pantry item not found" });
    res.json({ deleted: id });
  } catch (err) {
    next(err);
  }
});

app.delete("/api/pantry", async (_req, res, next) => {
  try {
    const result = await run("DELETE FROM pantry_items");
    res.json({ deleted: result.changes });
  } catch (err) {
    next(err);
  }
});

app.get("/api/recipes", async (_req, res, next) => {
  try {
    const rows = await all("SELECT * FROM recipes ORDER BY id DESC");
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

app.post("/api/recipes", async (req, res, next) => {
  try {
    const title = String(req.body?.title || "").trim();
    const instructions = String(req.body?.instructions || "").trim();
    if (!title || !instructions) return badRequest(res, "title and instructions are required");

    const createdAt = new Date().toISOString();
    const result = await run(
      `INSERT INTO recipes (title, instructions, created_at) VALUES (?, ?, ?)`,
      [title, instructions, createdAt]
    );

    const created = await get("SELECT * FROM recipes WHERE id = ?", [result.id]);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

app.delete("/api/recipes/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const result = await run("DELETE FROM recipes WHERE id = ?", [id]);
    if (!result.changes) return res.status(404).json({ error: "Recipe not found" });
    res.json({ deleted: id });
  } catch (err) {
    next(err);
  }
});

app.get("/api/shopping-list", async (req, res, next) => {
  try {
    const checked = req.query.checked;
    if (checked === undefined) {
      const rows = await all("SELECT * FROM shopping_items ORDER BY id DESC");
      return res.json(rows.map((r) => ({ ...r, checked: Boolean(r.checked) })));
    }

    const boolChecked = checked === "true";
    const rows = await all("SELECT * FROM shopping_items WHERE checked = ? ORDER BY id DESC", [boolChecked ? 1 : 0]);
    res.json(rows.map((r) => ({ ...r, checked: Boolean(r.checked) })));
  } catch (err) {
    next(err);
  }
});

app.post("/api/shopping-list", async (req, res, next) => {
  try {
    const name = normalizeName(req.body?.name);
    if (!name) return badRequest(res, "name is required");

    const quantity = req.body?.quantity == null ? null : Number(req.body.quantity);
    if (quantity !== null && Number.isNaN(quantity)) return badRequest(res, "quantity must be a number");

    const unit = req.body?.unit == null ? null : normalizeName(req.body.unit) || null;
    const checked = req.body?.checked ? 1 : 0;

    const createdAt = new Date().toISOString();
    const result = await run(
      `INSERT INTO shopping_items (name, quantity, unit, checked, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [name, quantity, unit, checked, createdAt]
    );

    const created = await get("SELECT * FROM shopping_items WHERE id = ?", [result.id]);
    res.status(201).json({ ...created, checked: Boolean(created.checked) });
  } catch (err) {
    next(err);
  }
});

app.patch("/api/shopping-list/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await get("SELECT * FROM shopping_items WHERE id = ?", [id]);
    if (!existing) return res.status(404).json({ error: "Shopping item not found" });

    const name = req.body?.name == null ? existing.name : normalizeName(req.body.name);
    const quantity = req.body?.quantity === undefined ? existing.quantity : req.body.quantity == null ? null : Number(req.body.quantity);
    const unit = req.body?.unit === undefined ? existing.unit : req.body.unit == null ? null : normalizeName(req.body.unit) || null;
    const checked = req.body?.checked === undefined ? existing.checked : req.body.checked ? 1 : 0;

    if (!name) return badRequest(res, "name cannot be empty");
    if (quantity !== null && Number.isNaN(quantity)) return badRequest(res, "quantity must be a number");

    await run(
      `UPDATE shopping_items SET name = ?, quantity = ?, unit = ?, checked = ? WHERE id = ?`,
      [name, quantity, unit, checked, id]
    );

    const updated = await get("SELECT * FROM shopping_items WHERE id = ?", [id]);
    res.json({ ...updated, checked: Boolean(updated.checked) });
  } catch (err) {
    next(err);
  }
});

app.delete("/api/shopping-list/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const result = await run("DELETE FROM shopping_items WHERE id = ?", [id]);
    if (!result.changes) return res.status(404).json({ error: "Shopping item not found" });
    res.json({ deleted: id });
  } catch (err) {
    next(err);
  }
});

app.get("/manual", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "manual.html"));
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "index.html"));
});

app.use((err, _req, res, _next) => {
  console.error("Unhandled server error:", err?.message || err);
  res.status(500).json({ error: "Internal server error" });
});

initDb()
  .then(() => {
    const server = app.listen(port, host, () => {
      console.log(`Pantry Manager running at http://${host}:${port}`);
    });
    server.on("error", (err) => {
      if (err && err.code === "EADDRINUSE") {
        console.error(`Port ${port} is already in use on ${host}. Set PORT to another value and retry.`);
        process.exit(1);
      }
      throw err;
    });
  })
  .catch((err) => {
    console.error("Failed to initialize database", err);
    process.exit(1);
  });
