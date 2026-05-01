const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const dbPath = process.env.DB_PATH || path.join(process.cwd(), "pantry_manager.db");
const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

function normalizeName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function todayPlusDays(days) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  now.setDate(now.getDate() + Number(days || 0));
  return now.toISOString().slice(0, 10);
}

async function tableExists(name) {
  const row = await get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [name]);
  return Boolean(row);
}

async function ensureUsersTable() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      preferences TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  const columns = await all("PRAGMA table_info(users)");
  const hasAdminColumn = columns.some((col) => col.name === "is_admin");
  if (!hasAdminColumn) {
    await run("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0");
  }
  const hasPreferencesColumn = columns.some((col) => col.name === "preferences");
  if (!hasPreferencesColumn) {
    await run("ALTER TABLE users ADD COLUMN preferences TEXT NOT NULL DEFAULT ''");
  }
}

async function createPantryTable() {
  await run(`
    CREATE TABLE IF NOT EXISTS pantry_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      unit TEXT NOT NULL DEFAULT 'unit',
      category TEXT NOT NULL DEFAULT 'uncategorized',
      expires_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, name),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
}

async function ensurePantryTable() {
  const exists = await tableExists("pantry_items");
  if (!exists) {
    await createPantryTable();
    return;
  }

  const columns = await all("PRAGMA table_info(pantry_items)");
  const hasUserId = columns.some((col) => col.name === "user_id");
  if (hasUserId) return;

  await run("ALTER TABLE pantry_items RENAME TO pantry_items_legacy");
  await createPantryTable();
  await run(`
    INSERT INTO pantry_items (id, user_id, name, quantity, unit, category, expires_at, created_at, updated_at)
    SELECT id, NULL, name, quantity, unit, category, expires_at, created_at, updated_at
    FROM pantry_items_legacy
  `);
  await run("DROP TABLE pantry_items_legacy");
}

async function initDb() {
  await run("PRAGMA foreign_keys = ON");

  await ensureUsersTable();
  await ensurePantryTable();

  await run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      last_used_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS global_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      default_unit TEXT NOT NULL DEFAULT 'unit',
      default_category TEXT NOT NULL DEFAULT 'uncategorized',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      instructions TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS shopping_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      quantity REAL,
      unit TEXT,
      checked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS queued_recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
}

module.exports = {
  db,
  run,
  get,
  all,
  initDb,
  normalizeName,
  todayPlusDays,
};
