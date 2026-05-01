require("dotenv").config();

const express = require("express");
const OpenAI = require("openai");
const crypto = require("crypto");
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
const backendSharedSecret = String(process.env.BACKEND_SHARED_SECRET || "");
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

const ADMIN_USERNAMES = new Set(
  String(process.env.ADMIN_USERNAMES || "")
    .split(",")
    .map((value) => normalizeName(value))
    .filter(Boolean)
);

app.use(express.json());
app.use(express.static(path.join(process.cwd(), "public")));

function isProtectedRoute(pathname) {
  return pathname === "/health" || pathname === "/api" || pathname.startsWith("/api/");
}

function hasValidBackendSecret(req) {
  const presented = String(req.headers["x-backend-secret"] || "");
  if (!backendSharedSecret || !presented) return false;
  const left = Buffer.from(backendSharedSecret, "utf8");
  const right = Buffer.from(presented, "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function isTrustedLocalAddress(remoteAddress) {
  const value = String(remoteAddress || "").trim().toLowerCase();
  if (!value) return false;
  const normalized = value.startsWith("::ffff:") ? value.slice(7) : value;
  if (normalized === "127.0.0.1" || normalized === "::1") return true;

  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalized)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(normalized)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(normalized)) return true;
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(normalized)) return true;

  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("fe80:")) return true;
  return false;
}

app.use((req, res, next) => {
  if (!backendSharedSecret) return next();
  if (!isProtectedRoute(req.path)) return next();
  if (hasValidBackendSecret(req)) return next();
  if (isTrustedLocalAddress(req.socket?.remoteAddress)) return next();
  return res.status(403).json({ error: "Forbidden" });
});

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

function sanitizeChatHistory(rawHistory) {
  if (!Array.isArray(rawHistory)) return [];
  const cleaned = [];
  for (const item of rawHistory) {
    if (typeof item === "string") {
      const content = item.trim();
      if (content) cleaned.push({ role: "user", content });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const role = item.role === "assistant" ? "assistant" : "user";
    const content = String(item.content || "").trim();
    if (!content) continue;
    cleaned.push({ role, content });
  }
  return cleaned;
}

function extractAssistantContent(response) {
  const content = response?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (!part || typeof part !== "object") return "";
      if (typeof part.text === "string") return part.text;
      if (typeof part.content === "string") return part.content;
      return "";
    })
    .join("")
    .trim();
}

function tryParseAssistantJson(rawContent) {
  const source = String(rawContent || "").trim();
  if (!source) return null;

  const tryParse = (value) => {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };

  const direct = tryParse(source);
  if (direct && typeof direct === "object") return direct;

  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const parsedFence = tryParse(fenced[1].trim());
    if (parsedFence && typeof parsedFence === "object") return parsedFence;
  }

  const firstBrace = source.indexOf("{");
  const lastBrace = source.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const embedded = tryParse(source.slice(firstBrace, lastBrace + 1));
    if (embedded && typeof embedded === "object") return embedded;
  }

  return null;
}

function looksLikeJson(raw) {
  const text = String(raw || "").trim();
  return text.startsWith("{") || text.startsWith("[") || text.includes("```json");
}

function isLowInformationReply(raw) {
  const compact = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[.!?]/g, "");
  return !compact || compact === "done" || compact === "ok" || compact === "okay";
}

function parseConfidence(raw) {
  const value = Number(raw);
  if (Number.isNaN(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

function shouldExecuteAction(mode, intent, confidence) {
  if (mode !== "action") return false;
  const safeIntent = String(intent || "").trim().toLowerCase();
  const mutateIntents = new Set(["add_pantry", "remove_pantry", "clear_pantry"]);
  const readIntents = new Set(["list_pantry"]);
  if (mutateIntents.has(safeIntent)) return confidence >= 0.8;
  if (readIntents.has(safeIntent)) return confidence >= 0.65;
  return false;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

function verifyPassword(password, storedHash) {
  const [salt, digest] = String(storedHash || "").split(":");
  if (!salt || !digest) return false;
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  const left = Buffer.from(digest, "hex");
  const right = Buffer.from(derived, "hex");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function parseBearerToken(req) {
  const header = String(req.headers.authorization || "").trim();
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function sanitizeUserPreferences(raw) {
  const value = String(raw == null ? "" : raw).replace(/\r\n/g, "\n").trim();
  return value.length > 600 ? value.slice(0, 600) : value;
}

function toAuthUser(row) {
  return {
    id: row.id,
    username: row.username,
    is_admin: Boolean(row.is_admin),
    preferences: sanitizeUserPreferences(row.preferences),
  };
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const now = new Date().toISOString();
  await run(
    `INSERT INTO sessions (user_id, token_hash, created_at, last_used_at)
     VALUES (?, ?, ?, ?)`,
    [userId, tokenHash, now, now]
  );
  return token;
}

async function resolveSession(token) {
  const tokenHash = hashToken(token);
  const row = await get(
    `SELECT s.id AS session_id, s.user_id, u.username, u.is_admin, u.preferences
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?`,
    [tokenHash]
  );
  if (!row) return null;

  await run(`UPDATE sessions SET last_used_at = ? WHERE id = ?`, [new Date().toISOString(), row.session_id]);
  return {
    sessionId: row.session_id,
    tokenHash,
    user: {
      id: row.user_id,
      username: row.username,
      is_admin: Boolean(row.is_admin),
      preferences: sanitizeUserPreferences(row.preferences),
    },
  };
}

async function requireAuth(req, res, next) {
  try {
    const token = parseBearerToken(req);
    if (!token) return res.status(401).json({ error: "Authentication required" });

    const session = await resolveSession(token);
    if (!session) return res.status(401).json({ error: "Invalid or expired session" });

    req.user = session.user;
    req.sessionId = session.sessionId;
    req.tokenHash = session.tokenHash;
    return next();
  } catch (err) {
    return next(err);
  }
}

function shouldGrantAdmin({ username }) {
  return ADMIN_USERNAMES.has(username);
}

async function requestAiPlan({ message, selectedModel, history, pantrySnapshot, userPreferences = "", recoveryHint = "" }) {
  let priorMessages = Array.isArray(history) ? [...history] : [];
  const last = priorMessages[priorMessages.length - 1];
  if (last?.role === "user" && String(last.content || "").trim() === String(message || "").trim()) {
    priorMessages = priorMessages.slice(0, -1);
  }
  const safePreferences = sanitizeUserPreferences(userPreferences);

  return openai.chat.completions.create({
    model: selectedModel,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "You are Pantry Manager AI orchestrator.",
          "Interpret user text and return JSON only.",
          "Default to natural conversation unless a concrete pantry action is clearly required.",
          "Schema:",
          "{",
          '  "mode": "chat|action",',
          '  "intent": "add_pantry|remove_pantry|list_pantry|clear_pantry|reply",',
          '  "confidence": number,',
          '  "items": [{"name":"string","quantity":number|null,"unit":"string|null","category":"string|null","expires_at":"YYYY-MM-DD|null"}],',
          '  "names": ["string"],',
          '  "reply": "string"',
          "}",
          "Rules:",
          "- mode=chat for normal Q&A, planning, recipe suggestions, explanations, and ambiguous requests.",
          "- mode=action only when user intent to perform pantry operation is clear and specific.",
          "- confidence is your certainty from 0.0 to 1.0.",
          "- If user asks to add pantry items, use intent=add_pantry with items.",
          "- If user asks to remove/delete pantry items, use intent=remove_pantry with names.",
          "- If user asks to list/show pantry, use intent=list_pantry.",
          "- If user asks to clear all pantry, use intent=clear_pantry.",
          "- Use prior user/assistant messages as conversation context.",
          "- Use pantry snapshot context to resolve references like 'it', 'them', or 'same as before'.",
          "- User preferences (if present) are LOW-to-MEDIUM weight guidance, not hard constraints.",
          "- Never override the user's explicit current message just to satisfy preferences.",
          "- Never invent pantry facts or ignore pantry data to satisfy preferences.",
          "- If intent=reply, reply must be a non-empty, helpful natural-language response.",
          "- Otherwise use intent=reply with concise helpful text.",
        ].join("\n"),
      },
      {
        role: "system",
        content: `Current pantry snapshot JSON:\n${JSON.stringify(Array.isArray(pantrySnapshot) ? pantrySnapshot : [])}`,
      },
      ...(safePreferences
        ? [
            {
              role: "system",
              content: `User preferences (soft guidance, low/medium influence):\n${safePreferences}`,
            },
          ]
        : []),
      ...(recoveryHint
        ? [
            {
              role: "system",
              content: [
                "Previous output was invalid, too short, or placeholder-like.",
                "Return one complete JSON object only, following the exact schema.",
                "Do not return values like 'done', 'ok', or empty reply text.",
                `Recovery hint: ${recoveryHint}`,
              ].join("\n"),
            },
          ]
        : []),
      ...priorMessages,
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

function extractRequestedRecipeCount(rawMessage, fallback = 5) {
  const message = String(rawMessage || "").toLowerCase();
  const match = message.match(/\b(\d{1,2})\s+(recipes?|meals?|ideas?)\b/);
  if (!match) return fallback;
  const n = Number(match[1]);
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, 1), 10);
}

function getLastAssistantMessage(history) {
  if (!Array.isArray(history)) return "";
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const item = history[i];
    if (item?.role === "assistant") {
      return String(item.content || "").trim();
    }
  }
  return "";
}

function looksLikeRecipeSuggestionText(raw) {
  const text = String(raw || "").toLowerCase();
  if (!text) return false;
  if (/\bhere are\b.*\brecipes?\b/.test(text)) return true;
  if (/\bpantry items?\s*:/.test(text)) return true;
  if (/\bsteps?\s*:/.test(text)) return true;
  if (/^\s*\d+\.\s+/m.test(text)) return true;
  return false;
}

function isLikelyRecipeRequest(message) {
  const text = String(message || "").trim().toLowerCase();
  if (!text) return false;
  const signals = [
    "recipe",
    "recipes",
    "what can i make",
    "what should i cook",
    "what can i cook",
    "cook with",
    "make with",
    "meal ideas",
    "meal idea",
    "dinner ideas",
    "lunch ideas",
    "breakfast ideas",
  ];
  return signals.some((s) => text.includes(s));
}

function isLikelyRecipeFollowupModifier(message) {
  const text = String(message || "").trim().toLowerCase();
  if (!text) return false;
  if (text.length > 90) return false;
  if (/^(add|rm|remove|delete|clear|list|set|use|discard|inc|dec|rename|category|expiry|find|expiring|shopping)\b/.test(text)) {
    return false;
  }
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 4) return true;
  const modifierSignals = [
    "more",
    "less",
    "higher protein",
    "lower carb",
    "spicy",
    "mild",
    "quick",
    "easy",
    "cheap",
    "budget",
    "healthy",
    "vegetarian",
    "vegan",
    "asian",
    "indian",
    "italian",
    "mexican",
    "mediterranean",
  ];
  return modifierSignals.some((s) => text.includes(s));
}

function collectRecentRecipeConstraints(history, currentMessage) {
  const constraints = [];
  const seen = new Set();
  const addConstraint = (value) => {
    const v = String(value || "").trim();
    if (!v) return;
    const key = v.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    constraints.push(v);
  };

  if (Array.isArray(history) && history.length) {
    let inRecipeContext = false;
    for (let i = history.length - 1; i >= 0; i -= 1) {
      const item = history[i];
      const role = String(item?.role || "").toLowerCase();
      const content = String(item?.content || "").trim();
      if (!content) continue;

      if (role === "assistant") {
        if (looksLikeRecipeSuggestionText(content)) {
          inRecipeContext = true;
          continue;
        }
        if (inRecipeContext) break;
        continue;
      }

      if (role === "user") {
        if (isLikelyRecipeRequest(content) || isLikelyRecipeFollowupModifier(content)) {
          addConstraint(content);
          inRecipeContext = true;
          continue;
        }
        if (inRecipeContext) break;
      }
    }
  }

  addConstraint(currentMessage);
  return constraints.reverse();
}

function resolveRecipeRouting({ message, history }) {
  const trimmed = String(message || "").trim();
  if (!trimmed) return { shouldRoute: false };

  if (isLikelyRecipeRequest(trimmed)) {
    return {
      shouldRoute: true,
      count: extractRequestedRecipeCount(trimmed, 5),
      prompt: trimmed,
    };
  }

  const lastAssistant = getLastAssistantMessage(history);
  if (!looksLikeRecipeSuggestionText(lastAssistant)) {
    return { shouldRoute: false };
  }
  if (!isLikelyRecipeFollowupModifier(trimmed)) {
    return { shouldRoute: false };
  }

  return {
    shouldRoute: true,
    count: extractRequestedRecipeCount(trimmed, 5),
    prompt: [
      "Previous assistant recipe suggestions:",
      lastAssistant.slice(0, 2500),
      "",
      `Current user follow-up modifier: ${trimmed}`,
      "Cumulative recipe constraints from recent turns:",
      ...collectRecentRecipeConstraints(history, trimmed).map((c) => `- ${c}`),
      "Regenerate recipe suggestions using pantry context and ALL listed constraints together.",
    ].join("\n"),
  };
}

async function upsertGlobalItemDefinition({ name, unit = null, category = null, allowOverride = false }) {
  const normalizedName = normalizeName(name);
  if (!normalizedName) return null;

  const existing = await get("SELECT * FROM global_items WHERE name = ?", [normalizedName]);
  const unitValue = normalizeName(unit || "") || null;
  const categoryValue = normalizeName(category || "") || null;

  if (!existing) {
    const now = new Date().toISOString();
    const insertUnit = allowOverride && unitValue ? unitValue : "unit";
    const insertCategory = allowOverride && categoryValue ? categoryValue : "uncategorized";
    const inserted = await run(
      `INSERT INTO global_items (name, default_unit, default_category, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [normalizedName, insertUnit, insertCategory, now, now]
    );
    return get("SELECT * FROM global_items WHERE id = ?", [inserted.id]);
  }

  if (allowOverride) {
    const nextUnit = unitValue || existing.default_unit || "unit";
    const nextCategory = categoryValue || existing.default_category || "uncategorized";
    if (nextUnit !== existing.default_unit || nextCategory !== existing.default_category) {
      await run(
        `UPDATE global_items
         SET default_unit = ?, default_category = ?, updated_at = ?
         WHERE id = ?`,
        [nextUnit, nextCategory, new Date().toISOString(), existing.id]
      );
      return get("SELECT * FROM global_items WHERE id = ?", [existing.id]);
    }
  }

  return existing;
}

async function upsertPantryItem({ userId, actorIsAdmin, name, quantity = 1, unit = null, category = null, expiresAt = null }) {
  const normalizedName = normalizeName(name);
  if (!normalizedName) return null;

  const qty = Number(quantity);
  const safeQuantity = Number.isNaN(qty) ? 1 : qty;

  const catalog = await upsertGlobalItemDefinition({
    name: normalizedName,
    unit,
    category,
    allowOverride: Boolean(actorIsAdmin),
  });

  const safeUnit = normalizeName(unit || "") || catalog?.default_unit || "unit";
  const safeCategory = normalizeName(category || "") || catalog?.default_category || "uncategorized";
  const now = new Date().toISOString();

  const existing = await get("SELECT * FROM pantry_items WHERE user_id = ? AND name = ?", [userId, normalizedName]);
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
    const row = await get("SELECT * FROM pantry_items WHERE id = ?", [existing.id]);
    return { row, created: false };
  }

  const insert = await run(
    `INSERT INTO pantry_items (user_id, name, quantity, unit, category, expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, normalizedName, safeQuantity, safeUnit, safeCategory, expiresAt || null, now, now]
  );
  const row = await get("SELECT * FROM pantry_items WHERE id = ?", [insert.id]);
  return { row, created: true };
}

async function removePantryByNames(userId, names) {
  const normalized = Array.from(new Set((names || []).map((n) => normalizeName(n)).filter(Boolean)));
  let removed = 0;
  for (const name of normalized) {
    const result = await run("DELETE FROM pantry_items WHERE user_id = ? AND name = ?", [userId, name]);
    removed += Number(result?.changes || 0);
  }
  return removed;
}

async function requestAiPlanWithFallback({ message, history, pantrySnapshot, userPreferences = "", recoveryHint = "" }) {
  try {
    return await requestAiPlan({
      message,
      selectedModel: model,
      history,
      pantrySnapshot,
      userPreferences,
      recoveryHint,
    });
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
    return requestAiPlan({
      message,
      selectedModel: fallbackModel,
      history,
      pantrySnapshot,
      userPreferences,
      recoveryHint,
    });
  }
}

async function requestAiRecipeSuggestions({
  selectedModel,
  pantrySnapshot,
  userPreferences = "",
  userPrompt = "",
  count = 5,
  preferenceStrength = "soft",
  recoveryHint = "",
}) {
  const safeCount = Math.min(Math.max(Number(count) || 5, 1), 10);
  const safePreferences = sanitizeUserPreferences(userPreferences);
  const strongPreferenceMode = String(preferenceStrength || "").toLowerCase() === "strong";

  return openai.chat.completions.create({
    model: selectedModel,
    max_tokens: 550,
    temperature: 0.5,
    messages: [
      {
        role: "system",
        content: [
          "You are a fast pantry recipe assistant.",
          `Suggest exactly ${safeCount} recipes the user can make from pantry items.`,
          "Output as a numbered markdown list.",
          "For each recipe include ONLY these fields:",
          "- Name",
          "- Pantry Items",
          "- Missing Items",
          "Missing Items should include only ingredients not currently in pantry and required to make the recipe.",
          "Do not include steps, instructions, tips, optional add-ons, or extra commentary.",
          "Keep response concise and practical.",
          "Each recipe must stay compact (2-4 short lines total).",
          "Do not cut off mid-item. Ensure all listed recipes are complete.",
          strongPreferenceMode
            ? "Treat user preferences as HIGH influence for recipe style and filtering while still using pantry reality."
            : "Use user preferences as LOW-to-MEDIUM influence only.",
          "Do not ignore pantry data or user's direct request.",
        ].join("\n"),
      },
      {
        role: "system",
        content: `Current pantry snapshot JSON:\n${JSON.stringify(Array.isArray(pantrySnapshot) ? pantrySnapshot : [])}`,
      },
      ...(safePreferences
        ? [
            {
              role: "system",
              content: `User preferences (soft guidance):\n${safePreferences}`,
            },
          ]
        : []),
      ...(recoveryHint
        ? [
            {
              role: "system",
              content: `Previous answer was too short/invalid. Recovery hint: ${recoveryHint}`,
            },
          ]
        : []),
      {
        role: "user",
        content: String(userPrompt || "").trim() || "What can I make?",
      },
    ],
  });
}

async function requestRecipeSuggestionsWithFallback({
  message,
  count,
  pantrySnapshot,
  userPreferences,
  preferenceStrength = "soft",
}) {
  const requestWithFallback = async (recoveryHint = "") => {
    try {
      return await requestAiRecipeSuggestions({
        selectedModel: model,
        pantrySnapshot,
        userPreferences,
        userPrompt: message,
        count,
        preferenceStrength,
        recoveryHint,
      });
    } catch (primaryErr) {
      const isProviderUnavailable =
        primaryErr?.status === 502 ||
        primaryErr?.status === 503 ||
        primaryErr?.status === 504 ||
        /provider returned error/i.test(String(primaryErr?.message || ""));
      const canFallback = Boolean(fallbackModel && fallbackModel !== model);
      if (!(isProviderUnavailable && canFallback)) throw primaryErr;
      return requestAiRecipeSuggestions({
        selectedModel: fallbackModel,
        pantrySnapshot,
        userPreferences,
        userPrompt: message,
        count,
        preferenceStrength,
        recoveryHint,
      });
    }
  };

  let response = await requestWithFallback();
  let raw = extractAssistantContent(response);
  if (isLowInformationReply(raw)) {
    const rawSnippet = String(raw || "").replace(/\s+/g, " ").trim().slice(0, 160);
    response = await requestWithFallback(rawSnippet || "Low-information output");
    raw = extractAssistantContent(response);
  }
  return !isLowInformationReply(raw)
    ? raw
    : "I could not generate recipe suggestions right now. Try again in a few seconds.";
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

app.post("/api/auth/register", async (req, res, next) => {
  try {
    const username = normalizeName(req.body?.username);
    const password = String(req.body?.password || "");
    const preferences = sanitizeUserPreferences(req.body?.preferences);

    if (!username) return badRequest(res, "username is required");
    if (username.length < 3) return badRequest(res, "username must be at least 3 characters");

    const existing = await get("SELECT id FROM users WHERE username = ?", [username]);
    if (existing) return res.status(409).json({ error: "username already exists" });

    const isAdmin = shouldGrantAdmin({ username }) ? 1 : 0;
    const now = new Date().toISOString();

    const created = await run(
      `INSERT INTO users (username, password_hash, is_admin, preferences, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [username, hashPassword(password), isAdmin, preferences, now, now]
    );

    const user = await get("SELECT id, username, is_admin, preferences FROM users WHERE id = ?", [created.id]);
    const token = await createSession(user.id);
    return res.status(201).json({ token, user: toAuthUser(user) });
  } catch (err) {
    return next(err);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const username = normalizeName(req.body?.username);
    const password = String(req.body?.password || "");

    if (!username || !password) return badRequest(res, "username and password are required");

    const user = await get("SELECT * FROM users WHERE username = ?", [username]);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: "invalid username or password" });
    }

    const token = await createSession(user.id);
    return res.json({ token, user: toAuthUser(user) });
  } catch (err) {
    return next(err);
  }
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

app.patch("/api/auth/preferences", requireAuth, async (req, res, next) => {
  try {
    const preferences = sanitizeUserPreferences(req.body?.preferences);
    await run("UPDATE users SET preferences = ?, updated_at = ? WHERE id = ?", [
      preferences,
      new Date().toISOString(),
      req.user.id,
    ]);
    const user = await get("SELECT id, username, is_admin, preferences FROM users WHERE id = ?", [req.user.id]);
    res.json({ user: toAuthUser(user) });
  } catch (err) {
    next(err);
  }
});

app.post("/api/auth/logout", requireAuth, async (req, res, next) => {
  try {
    await run("DELETE FROM sessions WHERE id = ?", [req.sessionId]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.post("/api/ai/chat", requireAuth, async (req, res, next) => {
  try {
    const message = String(req.body?.message || "").trim();
    if (!message) return badRequest(res, "message is required");
    if (!openai) return res.status(500).json({ error: "OPENROUTER_API_KEY is not set" });

    const history = sanitizeChatHistory(req.body?.history);
    const pantrySnapshot = await all(
      "SELECT name, quantity, unit, category, expires_at FROM pantry_items WHERE user_id = ? ORDER BY updated_at ASC, id ASC",
      [req.user.id]
    );

    const recipeRouting = resolveRecipeRouting({ message, history });
    if (recipeRouting.shouldRoute) {
      const reply = await requestRecipeSuggestionsWithFallback({
        message: recipeRouting.prompt,
        count: recipeRouting.count,
        pantrySnapshot,
        userPreferences: req.user.preferences,
        preferenceStrength: "soft",
      });
      return res.json({ reply, refresh_pantry: false });
    }

    let response = await requestAiPlanWithFallback({
      message,
      history,
      pantrySnapshot,
      userPreferences: req.user.preferences,
    });
    let raw = extractAssistantContent(response);
    let parsed = tryParseAssistantJson(raw) || {};
    let mode = String(parsed?.mode || "chat").trim().toLowerCase();
    let intent = String(parsed?.intent || "reply").trim().toLowerCase();
    let confidence = parseConfidence(parsed?.confidence);
    let replyText = String(parsed?.reply || "").trim();

    const needsRecoveryPass =
      isLowInformationReply(raw) ||
      (intent === "reply" && isLowInformationReply(replyText)) ||
      (!tryParseAssistantJson(raw) && looksLikeJson(raw));

    if (needsRecoveryPass) {
      const rawSnippet = String(raw || "").replace(/\s+/g, " ").trim().slice(0, 160);
      response = await requestAiPlanWithFallback({
        message,
        history,
        pantrySnapshot,
        userPreferences: req.user.preferences,
        recoveryHint: rawSnippet || "Missing/placeholder response",
      });
      raw = extractAssistantContent(response);
      parsed = tryParseAssistantJson(raw) || {};
      mode = String(parsed?.mode || "chat").trim().toLowerCase();
      intent = String(parsed?.intent || "reply").trim().toLowerCase();
      confidence = parseConfidence(parsed?.confidence);
      replyText = String(parsed?.reply || "").trim();
    }

    if (shouldExecuteAction(mode, intent, confidence) && intent === "add_pantry") {
      const items = Array.isArray(parsed?.items) ? parsed.items : [];
      if (!items.length) {
        return res.json({ reply: "I did not find items to add. Try: add eggs, milk.", refresh_pantry: false });
      }

      const added = [];
      for (const item of items) {
        const result = await upsertPantryItem({
          userId: req.user.id,
          actorIsAdmin: req.user.is_admin,
          name: item?.name,
          quantity: item?.quantity == null ? 1 : item.quantity,
          unit: item?.unit || null,
          category: item?.category || null,
          expiresAt: item?.expires_at || null,
        });
        if (result?.row?.name) added.push(result.row.name);
      }

      return res.json({
        reply: added.length ? `Added to pantry: ${added.join(", ")}.` : "No valid items were added.",
        refresh_pantry: true,
      });
    }

    if (shouldExecuteAction(mode, intent, confidence) && intent === "remove_pantry") {
      let names = Array.isArray(parsed?.names) ? parsed.names : [];
      if (!names.length && typeof message === "string") {
        const maybe = message.replace(/^rm\b|^remove\b|^delete\b/i, "").trim();
        names = parseCsvList(maybe);
      }

      const removed = await removePantryByNames(req.user.id, names);
      return res.json({
        reply: removed ? `Removed ${removed} pantry item(s).` : "No matching pantry items found to remove.",
        refresh_pantry: true,
      });
    }

    if (shouldExecuteAction(mode, intent, confidence) && intent === "list_pantry") {
      const rows = await all("SELECT * FROM pantry_items WHERE user_id = ? ORDER BY name", [req.user.id]);
      const names = rows.map((r) => r.name);
      return res.json({
        reply: names.length ? `Pantry items: ${names.join(", ")}.` : "Pantry is empty.",
        refresh_pantry: true,
      });
    }

    if (shouldExecuteAction(mode, intent, confidence) && intent === "clear_pantry") {
      const result = await run("DELETE FROM pantry_items WHERE user_id = ?", [req.user.id]);
      return res.json({
        reply: `Pantry cleared. Deleted ${Number(result?.changes || 0)} item(s).`,
        refresh_pantry: true,
      });
    }

    const rawFallbackReply = !looksLikeJson(raw) ? raw.trim() : "";
    const lowConfidenceAction = mode === "action" && !shouldExecuteAction(mode, intent, confidence);
    const finalReply = !isLowInformationReply(replyText)
      ? replyText
      : !isLowInformationReply(rawFallbackReply)
        ? rawFallbackReply
        : lowConfidenceAction
          ? "I might be misunderstanding. Do you want me to change your pantry, or just answer conversationally?"
          : "I understood your message, but I need more detail. Try a specific pantry request like 'add eggs, milk' or 'list pantry'.";

    return res.json({ reply: finalReply, refresh_pantry: false });
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

app.post("/api/ai/recipes", requireAuth, async (req, res, next) => {
  try {
    if (!openai) return res.status(500).json({ error: "OPENROUTER_API_KEY is not set" });
    const message = String(req.body?.message || "").trim();
    const count = req.body?.count == null ? extractRequestedRecipeCount(message, 5) : Number(req.body.count);
    const preferenceStrength = String(req.body?.preference_strength || "soft").toLowerCase() === "strong" ? "strong" : "soft";
    if (Number.isNaN(count) || count < 1 || count > 10) {
      return badRequest(res, "count must be between 1 and 10");
    }

    const pantrySnapshot = await all(
      "SELECT name, quantity, unit, category, expires_at FROM pantry_items WHERE user_id = ? ORDER BY updated_at ASC, id ASC",
      [req.user.id]
    );

    const reply = await requestRecipeSuggestionsWithFallback({
      message,
      count,
      pantrySnapshot,
      userPreferences: req.user.preferences,
      preferenceStrength,
    });
    return res.json({ reply, refresh_pantry: false });
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

app.get("/api/recipe-queue", requireAuth, async (req, res, next) => {
  try {
    const rows = await all(
      "SELECT id, title, notes, created_at FROM queued_recipes WHERE user_id = ? ORDER BY id DESC",
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

app.post("/api/recipe-queue/bulk", requireAuth, async (req, res, next) => {
  try {
    const recipes = Array.isArray(req.body?.recipes) ? req.body.recipes : [];
    if (!recipes.length) return badRequest(res, "recipes is required");
    const now = new Date().toISOString();
    const added = [];
    for (const item of recipes.slice(0, 20)) {
      const title = String(item?.title || "").trim();
      const notes = String(item?.notes || "").trim();
      if (!title) continue;
      const result = await run(
        "INSERT INTO queued_recipes (user_id, title, notes, created_at) VALUES (?, ?, ?, ?)",
        [req.user.id, title.slice(0, 200), notes.slice(0, 4000), now]
      );
      added.push(result.id);
    }
    if (!added.length) return badRequest(res, "No valid recipes to queue");
    const placeholders = added.map(() => "?").join(", ");
    const rows = await all(
      `SELECT id, title, notes, created_at FROM queued_recipes WHERE id IN (${placeholders}) ORDER BY id DESC`,
      added
    );
    res.status(201).json({ added: rows.length, recipes: rows });
  } catch (err) {
    next(err);
  }
});

app.delete("/api/recipe-queue/:id", requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return badRequest(res, "invalid id");
    const result = await run("DELETE FROM queued_recipes WHERE id = ? AND user_id = ?", [id, req.user.id]);
    if (!result.changes) return res.status(404).json({ error: "Queued recipe not found" });
    res.json({ deleted: id });
  } catch (err) {
    next(err);
  }
});

app.delete("/api/recipe-queue", requireAuth, async (req, res, next) => {
  try {
    const result = await run("DELETE FROM queued_recipes WHERE user_id = ?", [req.user.id]);
    res.json({ deleted: Number(result?.changes || 0) });
  } catch (err) {
    next(err);
  }
});

app.get("/api/pantry", requireAuth, async (req, res, next) => {
  try {
    const category = req.query.category ? normalizeName(req.query.category) : null;
    const expiringWithin = req.query.expiring_within_days;

    let sql = "SELECT * FROM pantry_items WHERE user_id = ?";
    const params = [req.user.id];

    if (category) {
      sql += " AND category = ?";
      params.push(category);
    }

    if (expiringWithin !== undefined) {
      const days = Number(expiringWithin);
      if (Number.isNaN(days) || days < 0) return badRequest(res, "expiring_within_days must be >= 0");
      sql += " AND expires_at IS NOT NULL AND expires_at <= ?";
      params.push(todayPlusDays(days));
    }

    sql += " ORDER BY name";
    const rows = await all(sql, params);
    res.json(rows.map(toPantryRead));
  } catch (err) {
    next(err);
  }
});

app.get("/api/pantry/expiring", requireAuth, async (req, res, next) => {
  try {
    const days = Number(req.query.days || 7);
    if (Number.isNaN(days) || days < 0) return badRequest(res, "days must be >= 0");

    const rows = await all(
      `SELECT * FROM pantry_items
       WHERE user_id = ? AND expires_at IS NOT NULL AND expires_at <= ?
       ORDER BY expires_at ASC`,
      [req.user.id, todayPlusDays(days)]
    );
    res.json(rows.map(toPantryRead));
  } catch (err) {
    next(err);
  }
});

app.post("/api/pantry", requireAuth, async (req, res, next) => {
  try {
    const name = normalizeName(req.body?.name);
    if (!name) return badRequest(res, "name is required");

    const quantity = req.body?.quantity == null ? 1 : Number(req.body.quantity);
    if (Number.isNaN(quantity)) return badRequest(res, "quantity must be a number");

    const result = await upsertPantryItem({
      userId: req.user.id,
      actorIsAdmin: req.user.is_admin,
      name,
      quantity,
      unit: req.body?.unit || null,
      category: req.body?.category || null,
      expiresAt: req.body?.expires_at || null,
    });

    if (!result?.row) return badRequest(res, "name is required");
    return res.status(result.created ? 201 : 200).json(toPantryRead(result.row));
  } catch (err) {
    next(err);
  }
});

app.patch("/api/pantry/:id", requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await get("SELECT * FROM pantry_items WHERE id = ? AND user_id = ?", [id, req.user.id]);
    if (!existing) return res.status(404).json({ error: "Pantry item not found" });

    const name = req.body?.name ? normalizeName(req.body.name) : existing.name;
    const quantity = req.body?.quantity == null ? existing.quantity : Number(req.body.quantity);
    const unit = req.body?.unit == null ? existing.unit : normalizeName(req.body.unit) || "unit";
    const category =
      req.body?.category == null ? existing.category : normalizeName(req.body.category) || "uncategorized";
    const expiresAt = req.body?.expires_at === undefined ? existing.expires_at : req.body.expires_at;

    if (!name) return badRequest(res, "name cannot be empty");
    if (Number.isNaN(quantity)) return badRequest(res, "quantity must be a number");

    const duplicate = await get("SELECT id FROM pantry_items WHERE user_id = ? AND name = ? AND id != ?", [
      req.user.id,
      name,
      id,
    ]);
    if (duplicate) return res.status(409).json({ error: "Pantry item with this name already exists" });

    if (req.user.is_admin && (req.body?.unit !== undefined || req.body?.category !== undefined)) {
      await upsertGlobalItemDefinition({
        name,
        unit,
        category,
        allowOverride: true,
      });
    } else {
      await upsertGlobalItemDefinition({
        name,
        unit: null,
        category: null,
        allowOverride: false,
      });
    }

    await run(
      `UPDATE pantry_items
       SET name = ?, quantity = ?, unit = ?, category = ?, expires_at = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
      [name, quantity, unit, category, expiresAt, new Date().toISOString(), id, req.user.id]
    );

    const updated = await get("SELECT * FROM pantry_items WHERE id = ?", [id]);
    res.json(toPantryRead(updated));
  } catch (err) {
    next(err);
  }
});

app.delete("/api/pantry/:id", requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const result = await run("DELETE FROM pantry_items WHERE id = ? AND user_id = ?", [id, req.user.id]);
    if (!result.changes) return res.status(404).json({ error: "Pantry item not found" });
    res.json({ deleted: id });
  } catch (err) {
    next(err);
  }
});

app.delete("/api/pantry", requireAuth, async (_req, res, next) => {
  try {
    const result = await run("DELETE FROM pantry_items WHERE user_id = ?", [_req.user.id]);
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
