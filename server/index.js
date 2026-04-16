const express = require("express");
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

app.post("/api/ai/chat", async (req, res) => {
  const message = String(req.body?.message || "").trim();
  if (!message) return badRequest(res, "message is required");

  res.json({
    reply:
      "AI backend is not connected yet. This endpoint is ready for model integration without changing pantry APIs.",
    refresh_pantry: false,
  });
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
  console.error(err);
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
