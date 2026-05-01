const chatLog = document.getElementById("chat-log");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const pantryList = document.getElementById("pantry-list");
const pantryMeta = document.getElementById("pantry-meta");
const statusEl = document.getElementById("api-status");
const useAiToggle = document.getElementById("use-ai-toggle");
const prefsBtn = document.getElementById("prefs-btn");
const helpBtn = document.getElementById("help-btn");
const helpModal = document.getElementById("help-modal");
const helpBackdrop = document.getElementById("help-backdrop");
const helpCloseBtn = document.getElementById("help-close");
const aboutBtn = document.getElementById("about-btn");
const aboutModal = document.getElementById("about-modal");
const aboutBackdrop = document.getElementById("about-backdrop");
const aboutCloseBtn = document.getElementById("about-close");
const loginBtn = document.getElementById("login-btn");
const registerBtn = document.getElementById("register-btn");
const loginModal = document.getElementById("login-modal");
const loginBackdrop = document.getElementById("login-backdrop");
const loginCloseBtn = document.getElementById("login-close");
const registerModal = document.getElementById("register-modal");
const registerBackdrop = document.getElementById("register-backdrop");
const registerCloseBtn = document.getElementById("register-close");
const prefsModal = document.getElementById("prefs-modal");
const prefsBackdrop = document.getElementById("prefs-backdrop");
const prefsCloseBtn = document.getElementById("prefs-close");
const prefsForm = document.getElementById("prefs-form");
const prefsInput = document.getElementById("prefs-input");
const prefsClearBtn = document.getElementById("prefs-clear");
const prefsFeedbackEl = document.getElementById("prefs-feedback");
const pantryModal = document.getElementById("pantry-modal");
const pantryModalBackdrop = document.getElementById("pantry-modal-backdrop");
const pantryModalCloseBtn = document.getElementById("pantry-modal-close");
const pantryModalMeta = document.getElementById("pantry-modal-meta");
const pantryModalList = document.getElementById("pantry-modal-list");
const queueBtn = document.getElementById("queue-btn");
const queuePanel = document.getElementById("queue-panel");
const queueModal = document.getElementById("queue-modal");
const queueBackdrop = document.getElementById("queue-backdrop");
const queueCloseBtn = document.getElementById("queue-close");
const queueClearBtn = document.getElementById("queue-clear");
const queueListEl = document.getElementById("queue-list");
const recipeModal = document.getElementById("recipe-modal");
const recipeBackdrop = document.getElementById("recipe-backdrop");
const recipeCloseBtn = document.getElementById("recipe-close");
const recipeTitleEl = document.getElementById("recipe-title");
const recipeBodyEl = document.getElementById("recipe-body");
const authStateEl = document.getElementById("auth-state");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const loginFeedbackEl = document.getElementById("login-feedback");
const registerFeedbackEl = document.getElementById("register-feedback");
const logoutBtn = document.getElementById("logout-btn");
const API_BASE_URL = "/api";
const AUTH_TOKEN_KEY = "pantry_auth_token";
const DEFAULT_MANUAL_MODE = false;
const MAX_HISTORY_MESSAGES = 16;
const userMessageHistory = [];
let lastPantryItems = [];
let editingPantryItemId = null;
let authToken = "";
let authUser = null;
const MANUAL_HELP =
  "Type `help` any time to see all commands.";
const HELP_TEXT = `Manual Commands

Pantry Basics
- add item1,item2
  Example: add green beans,corn
  Adds all comma-separated items.

- rm item1,item2
  Example: rm corn,milk
  Removes matching pantry items.

- list
  Shows all pantry items in the pantry panel.

- drop_table
  Clears the entire pantry.

Inventory Updates
- set item,qty,category
  Example: set rice,2,grains
  Sets exact quantity + category (creates item if needed).

- use item,qty
  Example: use rice,1
  Subtracts quantity.

- discard item,qty
  Example: discard spinach,1
  Subtracts quantity (same behavior as use for now).

- inc item,qty
  Example: inc rice,0.5
  Increases quantity.

- dec item,qty
  Example: dec rice,0.5
  Decreases quantity.

Metadata
- rename old,new
  Example: rename green onion,scallion
  Renames an item.

- category item,cat
  Example: category chickpeas,legumes
  Updates category.

- expiry item,YYYY-MM-DD
  Example: expiry milk,2026-04-20
  Updates expiration date.

Search & Views
- find term
  Example: find bean
  Filters pantry list by name.

- expiring N
  Example: expiring 7
  Shows items expiring within N days.

Shopping List
- shopping add item1,item2
  Example: shopping add onions,tomatoes
  Adds shopping items.

- shopping rm item1,item2
  Example: shopping rm onions
  Removes shopping items.

- shopping list
  Shows current shopping list.

Profile Preferences
- prefs get
  Shows your current AI preference text.

- prefs set <text>
  Example: prefs set Prefer South Indian vegetarian dinners; low oil.
  Saves soft AI guidance for your account.

- prefs clear
  Clears your saved AI preference text.

Support
- help
  Shows this guide.`;

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function addHistory(role, content) {
  const text = String(content || "").trim();
  if (!text) return;
  const safeRole = role === "assistant" ? "assistant" : "user";
  userMessageHistory.push({ role: safeRole, content: text });
  if (userMessageHistory.length > MAX_HISTORY_MESSAGES) {
    userMessageHistory.splice(0, userMessageHistory.length - MAX_HISTORY_MESSAGES);
  }
}

function clearHistory() {
  userMessageHistory.length = 0;
}

function clearConversationContext() {
  clearHistory();
  addMessage("bot", "Conversation context cleared.");
}

function isClearContextCommand(message) {
  const normalized = String(message || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return normalized === "reset context" || normalized === "clear context" || normalized === "new topic";
}

function formatInlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function renderBotMessageHtml(text) {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const chunks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i += 1;
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      chunks.push(`<p class="recipe-title">${formatInlineMarkdown(line.replace(/^\d+\.\s+/, ""))}</p>`);
      i += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, "").trim());
        i += 1;
      }
      chunks.push(`<ul>${items.map((item) => `<li>${formatInlineMarkdown(item)}</li>`).join("")}</ul>`);
      continue;
    }

    const paragraph = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i])
    ) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    const textValue = paragraph.join(" ");
    const isPantryLine = /^pantry items?\s*:/i.test(textValue);
    const isMissingLine = /^missing items?\s*:/i.test(textValue);
    const cls = isPantryLine ? "recipe-pantry" : isMissingLine ? "recipe-missing" : "";
    chunks.push(`<p${cls ? ` class="${cls}"` : ""}>${formatInlineMarkdown(textValue)}</p>`);
  }

  return chunks.join("");
}

function isRecipeDetailPrefix(value) {
  return /^(pantry items?|missing items?|ingredients?|steps?)\s*:/i.test(String(value || ""));
}

function normalizeRecipeTitleLine(line) {
  return String(line || "")
    .replace(/^#{1,6}\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .replace(/^\*\*(.+?)\*\*$/, "$1")
    .replace(/:$/, "")
    .trim();
}

function isPossibleRecipeTitleLine(line) {
  const value = String(line || "").trim();
  if (!value || value.length > 120) return false;
  if (isRecipeDetailPrefix(value)) return false;
  if (/^[-*]\s+/.test(value)) return false;
  if (/^\d+\.\s+/.test(value)) return true;
  if (/^#{1,6}\s+/.test(value)) return true;
  if (/^\*\*.+\*\*$/.test(value)) return true;
  return /^[A-Z][\w\s'()/-]{2,}$/.test(value);
}

function extractRecipeIntroText(text) {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  let cutoff = lines.length;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    const next = i + 1 < lines.length ? lines[i + 1].trim() : "";
    if (isPossibleRecipeTitleLine(line) && (isRecipeDetailPrefix(next) || !next || /^[-*]\s+/.test(next))) {
      cutoff = i;
      break;
    }
  }
  return lines
    .slice(0, cutoff)
    .join("\n")
    .trim();
}

function extractQueuedRecipesFromText(text) {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const recipes = [];
  let current = null;

  const pushCurrent = () => {
    if (!current) return;
    const title = String(current.title || "").trim();
    if (!title) return;
    const notes = current.details.join("\n").trim();
    recipes.push({ title, notes });
  };

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) {
      if (current) current.details.push("");
      continue;
    }

    const titleCandidate = normalizeRecipeTitleLine(line);
    const next = i + 1 < lines.length ? lines[i + 1].trim().toLowerCase() : "";
    const looksLikeTitle =
      isPossibleRecipeTitleLine(line) &&
      (isRecipeDetailPrefix(next) || !next || /^[-*]\s+/.test(next));

    if (looksLikeTitle) {
      pushCurrent();
      current = { title: titleCandidate, details: [] };
      continue;
    }

    if (current) current.details.push(line);
  }
  pushCurrent();

  const unique = [];
  const seen = new Set();
  for (const recipe of recipes) {
    const key = recipe.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(recipe);
  }
  return unique.slice(0, 10);
}

function splitRecipeList(value) {
  return String(value || "")
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function classifyRecipeLabel(label) {
  const normalized = String(label || "").toLowerCase().trim();
  if (!normalized) return "";
  if (/(pantry|on hand|available|have)/.test(normalized)) return "pantry";
  if (/(missing|need|buy|required|to get)/.test(normalized)) return "missing";
  if (/ingredient/.test(normalized)) return "ingredients";
  if (/step|instruction|method|direction/.test(normalized)) return "steps";
  return "";
}

function derivePantryMissingFromIngredients(ingredients) {
  const pantryNames = (lastPantryItems || [])
    .map((item) => normalizeName(item?.name || item?.canonical_name || item?.display_name || ""))
    .filter(Boolean);
  const pantryItems = [];
  const missingItems = [];
  const seenPantry = new Set();
  const seenMissing = new Set();

  for (const ingredientRaw of ingredients) {
    const ingredient = normalizeName(String(ingredientRaw || ""));
    if (!ingredient) continue;
    const inPantry = pantryNames.some(
      (name) => ingredient.includes(name) || name.includes(ingredient)
    );
    if (inPantry) {
      if (!seenPantry.has(ingredient)) {
        seenPantry.add(ingredient);
        pantryItems.push(ingredientRaw);
      }
    } else if (!seenMissing.has(ingredient)) {
      seenMissing.add(ingredient);
      missingItems.push(ingredientRaw);
    }
  }

  return { pantryItems, missingItems };
}

function parseRecipeNotes(notes) {
  const lines = String(notes || "").replace(/\r\n/g, "\n").split("\n");
  const parsed = { pantryItems: [], missingItems: [], ingredients: [], steps: [], extras: [] };
  let section = "";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const lower = line.toLowerCase();
    const labelMatch = line.match(/^([^:]+):\s*(.+)?$/);
    if (labelMatch) {
      const labelType = classifyRecipeLabel(labelMatch[1]);
      const rest = String(labelMatch[2] || "").trim();
      if (labelType === "pantry") {
        const items = splitRecipeList(rest);
        if (items.length) parsed.pantryItems.push(...items);
        section = "pantry";
        continue;
      }
      if (labelType === "missing") {
        const items = splitRecipeList(rest);
        if (items.length) parsed.missingItems.push(...items);
        section = "missing";
        continue;
      }
      if (labelType === "ingredients") {
        const inline = splitRecipeList(rest);
        if (inline.length) parsed.ingredients.push(...inline);
        section = "ingredients";
        continue;
      }
      if (labelType === "steps") {
        if (rest) parsed.steps.push(rest);
        section = "steps";
        continue;
      }
    }

    const bulletMatch = line.match(/^[-*]\s+(.+)$/);
    const orderedMatch = line.match(/^\d+\.\s+(.+)$/);
    const entry = bulletMatch ? bulletMatch[1].trim() : orderedMatch ? orderedMatch[1].trim() : line;

    if (section === "ingredients") {
      parsed.ingredients.push(entry);
      continue;
    }
    if (section === "steps") {
      parsed.steps.push(entry);
      continue;
    }
    parsed.extras.push(line);
  }

  if ((!parsed.pantryItems.length || !parsed.missingItems.length) && parsed.ingredients.length) {
    const derived = derivePantryMissingFromIngredients(parsed.ingredients);
    if (!parsed.pantryItems.length && derived.pantryItems.length) {
      parsed.pantryItems = derived.pantryItems;
    }
    if (!parsed.missingItems.length && derived.missingItems.length) {
      parsed.missingItems = derived.missingItems;
    }
  }

  return parsed;
}

function formatRecipeBody(recipe) {
  const parsed = parseRecipeNotes(recipe.notes || "");
  const lines = [];

  if (parsed.pantryItems.length) {
    lines.push(`Pantry Items: ${parsed.pantryItems.join(", ")}`);
    lines.push("");
  }
  if (parsed.missingItems.length) {
    lines.push(`Missing Items: ${parsed.missingItems.join(", ")}`);
    lines.push("");
  }
  if (parsed.ingredients.length) {
    lines.push("Ingredients:");
    for (const ingredient of parsed.ingredients) lines.push(`- ${ingredient}`);
    lines.push("");
  }
  if (parsed.steps.length) {
    lines.push("Steps:");
    parsed.steps.forEach((step, idx) => lines.push(`${idx + 1}. ${step}`));
    lines.push("");
  }
  if (parsed.extras.length) {
    lines.push(...parsed.extras);
  }

  return lines.join("\n").trim() || String(recipe.notes || "").trim() || "No recipe details available.";
}

function openRecipeModal(recipe) {
  if (!recipeModal || !recipeTitleEl || !recipeBodyEl) return;
  recipeTitleEl.textContent = String(recipe?.title || "Recipe");
  recipeBodyEl.textContent = formatRecipeBody(recipe);
  recipeModal.classList.remove("hidden");
  recipeModal.setAttribute("aria-hidden", "false");
}

function closeRecipeModal() {
  if (!recipeModal) return;
  recipeModal.classList.add("hidden");
  recipeModal.setAttribute("aria-hidden", "true");
}

async function requestFullRecipeForTitle(title, triggerButton = null) {
  const prompt = `Give me the full recipe for "${title}" with ingredients and step-by-step instructions for exactly this dish only. Do not suggest alternatives.`;
  try {
    if (triggerButton) triggerButton.disabled = true;
    await handleChat(prompt);
  } catch (err) {
    addMessage("bot", `Error: ${err.message}`);
  } finally {
    if (triggerButton) triggerButton.disabled = false;
  }
}

function createRecipeQueueButton(recipe) {
  const queueButton = document.createElement("button");
  queueButton.type = "button";
  queueButton.className = "recipe-action-btn recipe-action-btn--primary";
  queueButton.textContent = "+ Queue";
  queueButton.title = `Add "${recipe.title}" to queue`;
  queueButton.addEventListener("click", async () => {
    try {
      ensureSignedIn();
      queueButton.disabled = true;
      await api("/recipe-queue/bulk", {
        method: "POST",
        body: JSON.stringify({ recipes: [recipe] }),
      });
      await refreshQueueList().catch(() => {});
      addMessage("bot", `Queued: ${recipe.title}`);
    } catch (err) {
      addMessage("bot", `Failed to queue recipe: ${err.message}`);
    } finally {
      queueButton.disabled = false;
    }
  });
  return queueButton;
}

function createRecipePromptButton(recipe) {
  const recipeButton = document.createElement("button");
  recipeButton.type = "button";
  recipeButton.className = "recipe-action-btn";
  recipeButton.textContent = "Recipe";
  recipeButton.addEventListener("click", async () => {
    await requestFullRecipeForTitle(recipe.title, recipeButton);
  });
  return recipeButton;
}

function renderRecipeCards(recipes) {
  const cards = document.createElement("div");
  cards.className = "recipe-cards";

  for (const recipe of recipes) {
    const parsed = parseRecipeNotes(recipe.notes || "");
    const pantryText = parsed.pantryItems.length ? parsed.pantryItems.join(", ") : "None listed";
    const missingText = parsed.missingItems.length ? parsed.missingItems.join(", ") : "None";
    const card = document.createElement("article");
    card.className = "recipe-card";
    card.innerHTML = `
      <div class="recipe-card-head">
        <h4 class="recipe-card-title">${escapeHtml(recipe.title)}</h4>
        <div class="recipe-card-actions"></div>
      </div>
      <div class="recipe-card-lines">
        <p class="recipe-card-line"><strong>Pantry items:</strong> ${escapeHtml(pantryText)}</p>
        <p class="recipe-card-line"><strong>Missing items:</strong> ${escapeHtml(missingText)}</p>
      </div>
    `;
    const actions = card.querySelector(".recipe-card-actions");
    actions?.appendChild(createRecipePromptButton(recipe));
    actions?.appendChild(createRecipeQueueButton(recipe));
    cards.appendChild(card);
  }

  return cards;
}

function isLikelyFullRecipeResponse(text) {
  const value = String(text || "").toLowerCase();
  if (!value) return false;
  const hasIngredients = /\bingredients?\s*:/.test(value);
  const hasSteps = /\bsteps?\s*:/.test(value) || /\binstructions?\s*:/.test(value);
  return hasIngredients && hasSteps;
}

function addMessage(role, text) {
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  if (role === "bot") {
    const recipeCandidates = extractQueuedRecipesFromText(text);
    if (recipeCandidates.length && !isLikelyFullRecipeResponse(text)) {
      const introText = extractRecipeIntroText(text);
      if (introText) {
        el.innerHTML = renderBotMessageHtml(introText);
      } else {
        el.innerHTML = "<p>Recommended recipes:</p>";
      }
      el.appendChild(renderRecipeCards(recipeCandidates));
    } else {
      el.innerHTML = renderBotMessageHtml(text);
    }
  } else {
    el.textContent = text;
  }
  chatLog.appendChild(el);
  chatLog.scrollTop = chatLog.scrollHeight;
}

async function refreshQueueList() {
  ensureSignedIn();
  const rows = await api("/recipe-queue");
  queueListEl.innerHTML = "";
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.textContent = "No queued recipes yet.";
    queueListEl.appendChild(empty);
    return;
  }
  for (const row of rows) {
    const item = document.createElement("div");
    item.className = "queue-item";
    item.innerHTML = `
      <h4>${escapeHtml(row.title)}</h4>
      <div class="prefs-actions queue-item-actions">
        <button type="button" class="recipe-action-btn queue-recipe">Recipe</button>
        <button type="button" class="recipe-action-btn queue-remove" data-id="${row.id}">Remove</button>
      </div>
    `;
    item.querySelector(".queue-recipe")?.addEventListener("click", async (event) => {
      const btn = event.currentTarget;
      await requestFullRecipeForTitle(row.title, btn);
    });
    item.querySelector(".queue-remove")?.addEventListener("click", async () => {
      try {
        await api(`/recipe-queue/${row.id}`, { method: "DELETE" });
        await refreshQueueList();
      } catch (err) {
        addMessage("bot", `Failed to remove queued recipe: ${err.message}`);
      }
    });
    queueListEl.appendChild(item);
  }
}

function apiUrl(path) {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

async function fetchApi(path, options) {
  return fetch(apiUrl(path), options);
}

async function api(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const res = await fetchApi(path, {
    headers,
    ...options,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Non-JSON API response for ${path}. Check API base URL.`);
  }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith("/auth/")) {
      clearAuth();
      throw new Error("Please login first.");
    }
    throw new Error(data?.error || (typeof data === "string" ? data : JSON.stringify(data)));
  }
  return data;
}

function setAuth(token, user) {
  authToken = String(token || "");
  authUser = user || null;
  if (authToken) {
    localStorage.setItem(AUTH_TOKEN_KEY, authToken);
  } else {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }
  renderAuthState();
}

function clearAuth() {
  authToken = "";
  authUser = null;
  localStorage.removeItem(AUTH_TOKEN_KEY);
  clearHistory();
  renderAuthState();
}

function renderAuthState() {
  if (!authStateEl) return;
  if (prefsBtn) prefsBtn.style.display = authUser ? "" : "none";
  if (loginBtn) loginBtn.style.display = authUser ? "none" : "";
  if (registerBtn) registerBtn.style.display = authUser ? "none" : "";
  if (logoutBtn) logoutBtn.style.display = authUser ? "" : "none";
  if (!authUser) {
    authStateEl.textContent = "Not signed in";
    return;
  }
  authStateEl.textContent = `Signed in as ${authUser.username}${authUser.is_admin ? " (admin)" : ""}`;
}

function ensureSignedIn() {
  if (!authToken || !authUser) {
    throw new Error("Please login first.");
  }
}

function setAuthFeedback(target, message, type = "neutral") {
  if (!target) return;
  target.textContent = String(message || "");
  target.classList.remove("error", "success");
  if (type === "error" || type === "success") {
    target.classList.add(type);
  }
}

function normalizeName(input) {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseManualCommand(message) {
  const trimmed = message.trim();
  const matched = trimmed.match(
    /^(add|rm|list|drop_table|set|use|discard|rename|category|expiry|inc|dec|find|expiring|help)\b\s*(.*)$/i
  );
  if (!matched) return null;

  const cmd = matched[1].toLowerCase();
  const tail = matched[2] ? matched[2].trim() : "";

  if (cmd === "list" || cmd === "drop_table" || cmd === "help") {
    return { command: cmd, items: [] };
  }

  if (!tail) {
    return { command: cmd, items: [] };
  }

  const items = tail
    .split(",")
    .map((s) => normalizeName(s))
    .filter(Boolean);

  return { command: cmd, items };
}

function parseCsvTail(tail) {
  return tail
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function formatShoppingList(items) {
  if (!items.length) return "Shopping list is empty.";
  const lines = items.map((item) => `- ${item.name}${item.quantity ? ` (${item.quantity}${item.unit ? ` ${item.unit}` : ""})` : ""}`);
  return `Shopping list:\n${lines.join("\n")}`;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const now = new Date();
  const target = new Date(dateStr + "T00:00:00");
  const ms = target.getTime() - new Date(now.toDateString()).getTime();
  return Math.round(ms / 86400000);
}

function isValidDateInput(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
}

function getPantrySummary(items) {
  const expiringSoon = items.filter((item) => {
    const days = daysUntil(item.expires_at);
    return days !== null && days >= 0 && days <= 7;
  }).length;
  const expired = items.filter((item) => {
    const days = daysUntil(item.expires_at);
    return days !== null && days < 0;
  }).length;
  const categories = new Set(
    items.map((item) => normalizeName(item?.category || "") || "uncategorized")
  );
  return { expiringSoon, expired, categories: categories.size };
}

function getDisplayName(item) {
  return item?.name || item?.canonical_name || item?.display_name || "unnamed item";
}

function formatExpiryLine(item) {
  const days = daysUntil(item.expires_at);
  if (!item.expires_at || days === null) return "No expiry";
  if (days < 0) return `Expired ${Math.abs(days)}d ago`;
  if (days <= 7) return `Expires in ${days}d`;
  return `Expires in ${days}d`;
}

function parseDateOnly(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const parsed = new Date(`${text}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function toDateOnlyString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getExtendedExpiryDate(existingExpiry, bumpDays) {
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const current = parseDateOnly(existingExpiry);
  const base = current && current.getTime() > todayStart.getTime() ? current : todayStart;
  const next = new Date(base);
  next.setDate(next.getDate() + bumpDays);
  return toDateOnlyString(next);
}

function stopEditingPantryItem() {
  editingPantryItemId = null;
}

function renderPantryModalList(items) {
  if (!pantryModalList || !pantryModalMeta) return;
  pantryModalList.innerHTML = "";
  if (!items.length) {
    pantryModalMeta.textContent = "Pantry is empty.";
    const empty = document.createElement("p");
    empty.className = "meta";
    empty.style.padding = "0";
    empty.textContent = "Add items to start tracking pantry details.";
    pantryModalList.appendChild(empty);
    return;
  }

  const { expiringSoon, expired, categories } = getPantrySummary(items);
  pantryModalMeta.textContent = `${items.length} items • ${categories} categories • ${expiringSoon} expiring soon • ${expired} expired`;

  const sorted = [...items].sort((a, b) => {
    const catA = normalizeName(a?.category || "") || "uncategorized";
    const catB = normalizeName(b?.category || "") || "uncategorized";
    const catCmp = catA.localeCompare(catB);
    if (catCmp !== 0) return catCmp;
    return getDisplayName(a).localeCompare(getDisplayName(b));
  });

  const grouped = new Map();
  for (const item of sorted) {
    const category = normalizeName(item?.category || "") || "uncategorized";
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category).push(item);
  }

  const titleCase = (value) =>
    String(value || "")
      .split(" ")
      .filter(Boolean)
      .map((word) => word[0].toUpperCase() + word.slice(1))
      .join(" ");

  for (const [category, categoryItems] of grouped.entries()) {
    const section = document.createElement("section");
    section.className = "pantry-modal-category";
    section.innerHTML = `
      <h3 class="pantry-modal-category-title">
        <span>${escapeHtml(titleCase(category))}</span>
        <span>${categoryItems.length}</span>
      </h3>
    `;

    for (const item of categoryItems) {
      const card = document.createElement("article");
      card.className = "pantry-modal-item";
      const itemName = getDisplayName(item);
      const unit = normalizeName(item.unit || "") || "unit";
      const expiryLine = formatExpiryLine(item);
      const isEditing = editingPantryItemId === item.id;

      card.innerHTML = `
        <div class="pantry-modal-item-head">
          <div>
            <h4>${escapeHtml(itemName)}</h4>
            <p><strong>${Number(item.quantity || 0)}</strong> ${escapeHtml(unit)} • ${escapeHtml(expiryLine)}</p>
          </div>
          <div class="pantry-modal-item-actions">
            <button type="button" class="recipe-action-btn pantry-item-edit" data-id="${item.id}">${isEditing ? "Close" : "Edit"}</button>
            <button type="button" class="recipe-action-btn pantry-item-remove" data-id="${item.id}">Remove</button>
          </div>
        </div>
      `;

      if (isEditing) {
        const form = document.createElement("form");
        form.className = "pantry-modal-edit-form";
        form.dataset.id = String(item.id);
        form.innerHTML = `
          <label>Name<input name="name" value="${escapeHtml(itemName)}" required /></label>
          <label>Quantity<input name="quantity" type="number" step="0.01" value="${escapeHtml(String(item.quantity ?? 1))}" required /></label>
          <label>Unit<input name="unit" value="${escapeHtml(item.unit || "")}" placeholder="unit" /></label>
          <label>Category<input name="category" value="${escapeHtml(item.category || "")}" placeholder="uncategorized" /></label>
          <div class="pantry-modal-expiry-quick">
            <span>Extend expiry</span>
            <div class="pantry-expiry-bumps">
              <button type="button" class="recipe-action-btn pantry-expiry-bump" data-id="${item.id}" data-days="1">+1d</button>
              <button type="button" class="recipe-action-btn pantry-expiry-bump" data-id="${item.id}" data-days="3">+3d</button>
              <button type="button" class="recipe-action-btn pantry-expiry-bump" data-id="${item.id}" data-days="7">+7d</button>
            </div>
          </div>
          <div class="pantry-modal-edit-actions">
            <button type="submit" class="recipe-action-btn recipe-action-btn--primary">Save</button>
            <button type="button" class="recipe-action-btn pantry-item-cancel" data-id="${item.id}">Cancel</button>
          </div>
        `;
        card.appendChild(form);
      }

      section.appendChild(card);
    }

    pantryModalList.appendChild(section);
  }
}

function renderPantry(items) {
  pantryList.innerHTML = "";

  const makeSummaryGrid = ({ total, expiringSoon, expired, categories }) => `
    <div class="pantry-summary-grid">
      <button type="button" class="summary-card pantry-summary-trigger"><h4>Total Items</h4><p>${total}</p></button>
      <button type="button" class="summary-card pantry-summary-trigger"><h4>Expiring (7d)</h4><p>${expiringSoon}</p></button>
      <button type="button" class="summary-card pantry-summary-trigger"><h4>Expired</h4><p>${expired}</p></button>
      <button type="button" class="summary-card pantry-summary-trigger"><h4>Categories</h4><p>${categories}</p></button>
    </div>
  `;

  if (!items.length) {
    pantryMeta.textContent = "No pantry items yet.";
    pantryList.innerHTML = makeSummaryGrid({ total: 0, expiringSoon: 0, expired: 0, categories: 0 });
    return;
  }

  const { expiringSoon, expired, categories } = getPantrySummary(items);

  pantryMeta.textContent = `Summary view (${items.length} item${items.length === 1 ? "" : "s"})`;
  pantryList.innerHTML = makeSummaryGrid({ total: items.length, expiringSoon, expired, categories });
}

async function refreshPantry() {
  ensureSignedIn();
  const items = await api("/pantry");
  lastPantryItems = items;
  if (editingPantryItemId && !items.some((item) => item.id === editingPantryItemId)) {
    editingPantryItemId = null;
  }
  renderPantry(items);
  return items;
}

async function runManualCommand(message) {
  const trimmed = message.trim();
  const prefsMatch = trimmed.match(/^(prefs|preferences)\s+(get|set|clear)\b\s*(.*)$/i);
  if (prefsMatch) {
    const action = prefsMatch[2].toLowerCase();
    const tail = prefsMatch[3] ? prefsMatch[3].trim() : "";

    if (action === "get") {
      const current = String(authUser?.preferences || "").trim();
      if (!current) {
        addMessage("bot", "No preferences set. Use: prefs set <text>");
      } else {
        addMessage("bot", `Current preferences:\n${current}`);
      }
      return;
    }

    if (action === "set") {
      if (!tail) {
        addMessage("bot", "Format: prefs set <text>");
        return;
      }
      const data = await api("/auth/preferences", {
        method: "PATCH",
        body: JSON.stringify({ preferences: tail }),
      });
      setAuth(authToken, data.user);
      addMessage("bot", "Preferences updated.");
      return;
    }

    if (action === "clear") {
      const data = await api("/auth/preferences", {
        method: "PATCH",
        body: JSON.stringify({ preferences: "" }),
      });
      setAuth(authToken, data.user);
      addMessage("bot", "Preferences cleared.");
      return;
    }
  }

  const shoppingMatch = trimmed.match(/^shopping\s+(add|rm|list)\b\s*(.*)$/i);
  if (shoppingMatch) {
    const action = shoppingMatch[1].toLowerCase();
    const tail = shoppingMatch[2] ? shoppingMatch[2].trim() : "";

    if (action === "list") {
      const items = await api("/shopping-list");
      addMessage("bot", formatShoppingList(items));
      return;
    }

    const names = parseCsvTail(tail).map((x) => normalizeName(x));
    if (!names.length) {
      addMessage("bot", `Format: shopping ${action} item1,item2`);
      return;
    }

    if (action === "add") {
      const added = [];
      for (const name of names) {
        const result = await api("/shopping-list", {
          method: "POST",
          body: JSON.stringify({ name, quantity: null, unit: null, checked: false }),
        });
        added.push(result.name);
      }
      addMessage("bot", `Shopping added: ${added.join(", ")}.`);
      return;
    }

    if (action === "rm") {
      const items = await api("/shopping-list");
      const removed = [];
      const notFound = [];
      for (const target of names) {
        const matches = items.filter((item) => normalizeName(item.name) === target);
        if (!matches.length) {
          notFound.push(target);
          continue;
        }
        for (const match of matches) {
          await api(`/shopping-list/${match.id}`, { method: "DELETE" });
          removed.push(match.name);
        }
      }
      if (removed.length) addMessage("bot", `Shopping removed: ${removed.join(", ")}.`);
      if (notFound.length) addMessage("bot", `Shopping not found: ${notFound.join(", ")}.`);
      return;
    }
  }

  const parsed = parseManualCommand(message);
  if (!parsed) {
    addMessage("bot", MANUAL_HELP);
    return;
  }

  if (parsed.command === "list") {
    await refreshPantry();
    addMessage("bot", "Pantry listed in the pantry panel.");
    return;
  }

  if (parsed.command === "help") {
    addMessage("bot", HELP_TEXT);
    return;
  }

  if (parsed.command === "drop_table") {
    const result = await api("/pantry", { method: "DELETE" });
    const deletedCount = Number(result?.deleted ?? 0);
    await refreshPantry();
    addMessage("bot", `Pantry cleared. Deleted ${deletedCount} item(s).`);
    return;
  }

  if (parsed.command === "rename") {
    const parts = parseCsvTail(trimmed.replace(/^rename\s+/i, ""));
    if (parts.length < 2) {
      addMessage("bot", "Format: rename old,new");
      return;
    }
    const oldName = normalizeName(parts[0]);
    const newName = normalizeName(parts[1]);
    const pantryItems = await api("/pantry");
    const existing = pantryItems.find((item) => normalizeName(item.name) === oldName);
    if (!existing) {
      addMessage("bot", `Not found: ${oldName}.`);
      return;
    }
    await api(`/pantry/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: newName }),
    });
    await refreshPantry();
    addMessage("bot", `Renamed ${oldName} -> ${newName}.`);
    return;
  }

  if (parsed.command === "category") {
    const parts = parseCsvTail(trimmed.replace(/^category\s+/i, ""));
    if (parts.length < 2) {
      addMessage("bot", "Format: category item,cat");
      return;
    }
    const name = normalizeName(parts[0]);
    const category = normalizeName(parts.slice(1).join(","));
    const pantryItems = await api("/pantry");
    const existing = pantryItems.find((item) => normalizeName(item.name) === name);
    if (!existing) {
      addMessage("bot", `Not found: ${name}.`);
      return;
    }
    await api(`/pantry/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify({ category }),
    });
    await refreshPantry();
    addMessage("bot", `Updated category: ${name} -> ${category}.`);
    return;
  }

  if (parsed.command === "expiry") {
    const parts = parseCsvTail(trimmed.replace(/^expiry\s+/i, ""));
    if (parts.length < 2) {
      addMessage("bot", "Format: expiry item,YYYY-MM-DD");
      return;
    }
    const name = normalizeName(parts[0]);
    const expiryDate = parts[1];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate) || Number.isNaN(new Date(`${expiryDate}T00:00:00`).getTime())) {
      addMessage("bot", "Date must be YYYY-MM-DD.");
      return;
    }
    const pantryItems = await api("/pantry");
    const existing = pantryItems.find((item) => normalizeName(item.name) === name);
    if (!existing) {
      addMessage("bot", `Not found: ${name}.`);
      return;
    }
    await api(`/pantry/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify({ expires_at: expiryDate }),
    });
    await refreshPantry();
    addMessage("bot", `Updated expiry: ${name} -> ${expiryDate}.`);
    return;
  }

  if (parsed.command === "inc" || parsed.command === "dec") {
    const parts = parseCsvTail(trimmed.replace(/^(inc|dec)\s+/i, ""));
    if (parts.length < 2) {
      addMessage("bot", `Format: ${parsed.command} item,qty`);
      return;
    }
    const name = normalizeName(parts[0]);
    const qty = Number(parts[1]);
    if (!name || Number.isNaN(qty) || qty <= 0) {
      addMessage("bot", `Format: ${parsed.command} item,qty`);
      return;
    }
    const pantryItems = await api("/pantry");
    const existing = pantryItems.find((item) => normalizeName(item.name) === name);
    if (!existing) {
      addMessage("bot", `Not found: ${name}.`);
      return;
    }
    const delta = parsed.command === "inc" ? qty : -qty;
    const nextQty = Number(existing.quantity || 0) + delta;
    if (nextQty < 0) {
      addMessage("bot", `Cannot reduce ${name} below 0.`);
      return;
    }
    await api(`/pantry/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify({ quantity: nextQty }),
    });
    await refreshPantry();
    addMessage("bot", `Adjusted ${name}: ${delta > 0 ? "+" : ""}${delta}.`);
    return;
  }

  if (parsed.command === "find") {
    const term = normalizeName(trimmed.replace(/^find\s+/i, ""));
    if (!term) {
      addMessage("bot", "Format: find term");
      return;
    }
    const items = await api("/pantry");
    const filtered = items.filter((item) => normalizeName(item.name).includes(term));
    renderPantry(filtered);
    addMessage("bot", `Found ${filtered.length} item(s) matching '${term}'.`);
    return;
  }

  if (parsed.command === "expiring") {
    const raw = trimmed.replace(/^expiring\s+/i, "").trim();
    const days = Number(raw);
    if (Number.isNaN(days) || days < 0) {
      addMessage("bot", "Format: expiring N");
      return;
    }
    const items = await api(`/pantry/expiring?days=${days}`);
    renderPantry(items);
    addMessage("bot", `Showing ${items.length} item(s) expiring within ${days} day(s).`);
    return;
  }

  if (parsed.command === "set") {
    const parts = message
      .trim()
      .replace(/^set\s+/i, "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length < 3) {
      addMessage("bot", "Format: set item,qty,category");
      return;
    }
    const name = normalizeName(parts[0]);
    const qty = Number(parts[1]);
    const category = parts.slice(2).join(",").trim().toLowerCase();
    if (!name || Number.isNaN(qty)) {
      addMessage("bot", "Format: set item,qty,category");
      return;
    }

    const pantryItems = await api("/pantry");
    const existing = pantryItems.find((item) => normalizeName(item.name) === name);

    if (existing) {
      await api(`/pantry/${existing.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          quantity: qty,
          category,
        }),
      });
      await refreshPantry();
      addMessage("bot", `Set ${name} to quantity ${qty} in category ${category}.`);
      return;
    }

    await api("/pantry", {
      method: "POST",
      body: JSON.stringify({
        name,
        quantity: qty,
        unit: null,
        category,
        expires_at: null,
      }),
    });
    await refreshPantry();
    addMessage("bot", `Created ${name} with quantity ${qty} in category ${category}.`);
    return;
  }

  if (parsed.command === "use" || parsed.command === "discard") {
    const parts = message
      .trim()
      .replace(/^(use|discard)\s+/i, "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length < 2) {
      addMessage("bot", `Format: ${parsed.command} item,qty`);
      return;
    }
    const name = normalizeName(parts[0]);
    const qty = Number(parts[1]);
    if (!name || Number.isNaN(qty) || qty <= 0) {
      addMessage("bot", `Format: ${parsed.command} item,qty`);
      return;
    }

    const pantryItems = await api("/pantry");
    const existing = pantryItems.find((item) => normalizeName(item.name) === name);
    if (!existing) {
      addMessage("bot", `Not found: ${name}.`);
      return;
    }

    const nextQty = Number(existing.quantity || 0) - qty;
    if (nextQty < 0) {
      addMessage("bot", `Cannot ${parsed.command} ${qty}; only ${existing.quantity} available.`);
      return;
    }
    await api(`/pantry/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify({ quantity: nextQty }),
    });
    await refreshPantry();
    addMessage("bot", `${parsed.command} applied: ${name} -${qty}.`);
    return;
  }

  if (!parsed.items.length) {
    addMessage("bot", `No items found. Use comma-separated items after '${parsed.command}'.`);
    return;
  }

  if (parsed.command === "add") {
    const added = [];
    for (const name of parsed.items) {
      const payload = {
        name,
        quantity: null,
        unit: null,
        category: null,
        expires_at: null,
      };
      try {
        const result = await api("/pantry", { method: "POST", body: JSON.stringify(payload) });
        added.push(result.name);
      } catch (err) {
        addMessage("bot", `Failed to add ${name}: ${err.message}`);
      }
    }
    await refreshPantry();
    if (added.length) {
      addMessage("bot", `Added: ${added.join(", ")}.`);
    }
    return;
  }

  if (parsed.command === "rm") {
    const pantryItems = await api("/pantry");
    const removed = [];
    const notFound = [];

    for (const target of parsed.items) {
      const matches = pantryItems.filter((item) => normalizeName(item.name) === target);
      if (!matches.length) {
        notFound.push(target);
        continue;
      }

      for (const match of matches) {
        try {
          await api(`/pantry/${match.id}`, { method: "DELETE" });
          removed.push(match.name);
        } catch (err) {
          addMessage("bot", `Failed to remove ${match.name}: ${err.message}`);
        }
      }
    }

    await refreshPantry();
    if (removed.length) {
      addMessage("bot", `Removed: ${removed.join(", ")}.`);
    }
    if (notFound.length) {
      addMessage("bot", `Not found: ${notFound.join(", ")}.`);
    }
    return;
  }
}

async function runAiMode(message) {
  const data = await api("/ai/chat", {
    method: "POST",
    body: JSON.stringify({ message, history: userMessageHistory }),
  });

  const reply = String(data?.reply || "").trim();
  const compactReply = reply.toLowerCase().replace(/[.!?]/g, "");
  const isTrivialReply =
    !compactReply || compactReply === "done" || compactReply === "ok" || compactReply === "okay";
  const displayedReply = isTrivialReply
    ? "AI backend returned a placeholder response. Try again, or turn on Manual mode and run a manual command."
    : reply;
  addMessage(
    "bot",
    displayedReply
  );
  addHistory("assistant", displayedReply);
  if (data.refresh_pantry) {
    await refreshPantry();
  }
}

async function handleChat(message) {
  ensureSignedIn();
  addMessage("user", message);
  if (isClearContextCommand(message)) {
    clearConversationContext();
    return;
  }
  if (useAiToggle.checked) {
    await runManualCommand(message);
    return;
  }
  addHistory("user", message);
  await runAiMode(message);
}

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const message = chatInput.value.trim();
  if (!message) return;
  chatInput.value = "";
  try {
    await handleChat(message);
  } catch (err) {
    addMessage("bot", `Error: ${err.message}`);
  }
});

document.getElementById("what-can-i-make")?.addEventListener("click", async () => {
  try {
    ensureSignedIn();
    const prompt = "What can I make?";
    addMessage("user", prompt);
    addHistory("user", prompt);
    const data = await api("/ai/recipes", {
      method: "POST",
      body: JSON.stringify({ message: prompt, count: 5, preference_strength: "strong" }),
    });
    const reply = String(data?.reply || "").trim();
    const displayedReply = reply || "Could not generate suggestions right now.";
    addMessage("bot", displayedReply);
    addHistory("assistant", displayedReply);
  } catch (err) {
    addMessage("bot", `Error: ${err.message}`);
  }
});

document.getElementById("clear-context")?.addEventListener("click", () => {
  clearConversationContext();
});


loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  setAuthFeedback(loginFeedbackEl, "");
  try {
    const data = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username: form.get("username"),
        password: form.get("password"),
      }),
    });
    clearHistory();
    setAuth(data.token, data.user);
    event.target.reset();
    await refreshPantry();
    closeLoginModal();
    addMessage("bot", `Welcome back, ${data.user.username}.`);
  } catch (err) {
    setAuthFeedback(loginFeedbackEl, `Login failed: ${err.message}`, "error");
  }
});

registerForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  setAuthFeedback(registerFeedbackEl, "");
  try {
    const data = await api("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        username: form.get("username"),
        password: form.get("password"),
      }),
    });
    clearHistory();
    setAuth(data.token, data.user);
    event.target.reset();
    await refreshPantry();
    closeRegisterModal();
    addMessage("bot", `Account created for ${data.user.username}.`);
  } catch (err) {
    setAuthFeedback(registerFeedbackEl, `Register failed: ${err.message}`, "error");
  }
});

logoutBtn?.addEventListener("click", async () => {
  try {
    if (authToken) {
      await api("/auth/logout", { method: "POST" });
    }
  } catch (_err) {
    // Ignore and clear local state anyway.
  }
  clearAuth();
  renderPantry([]);
  addMessage("bot", "Signed out.");
});

function openHelpModal() {
  helpModal.classList.remove("hidden");
  helpModal.setAttribute("aria-hidden", "false");
}

function closeHelpModal() {
  helpModal.classList.add("hidden");
  helpModal.setAttribute("aria-hidden", "true");
}

function openAboutModal() {
  aboutModal.classList.remove("hidden");
  aboutModal.setAttribute("aria-hidden", "false");
}

function closeAboutModal() {
  aboutModal.classList.add("hidden");
  aboutModal.setAttribute("aria-hidden", "true");
}

function openLoginModal() {
  setAuthFeedback(loginFeedbackEl, "");
  loginModal.classList.remove("hidden");
  loginModal.setAttribute("aria-hidden", "false");
}

function closeLoginModal() {
  loginModal.classList.add("hidden");
  loginModal.setAttribute("aria-hidden", "true");
}

function openRegisterModal() {
  setAuthFeedback(registerFeedbackEl, "");
  registerModal.classList.remove("hidden");
  registerModal.setAttribute("aria-hidden", "false");
}

function closeRegisterModal() {
  registerModal.classList.add("hidden");
  registerModal.setAttribute("aria-hidden", "true");
}

function openPrefsModal() {
  if (!authUser) {
    addMessage("bot", "Please login first.");
    return;
  }
  setAuthFeedback(prefsFeedbackEl, "");
  if (prefsInput) prefsInput.value = String(authUser.preferences || "");
  prefsModal.classList.remove("hidden");
  prefsModal.setAttribute("aria-hidden", "false");
}

function closePrefsModal() {
  prefsModal.classList.add("hidden");
  prefsModal.setAttribute("aria-hidden", "true");
}

async function openPantryModal() {
  if (!authUser) {
    addMessage("bot", "Please login first.");
    return;
  }
  pantryModal?.classList.remove("hidden");
  pantryModal?.setAttribute("aria-hidden", "false");
  try {
    await refreshPantry();
    renderPantryModalList(lastPantryItems);
  } catch (err) {
    addMessage("bot", `Failed to load pantry details: ${err.message}`);
  }
}

function closePantryModal() {
  stopEditingPantryItem();
  pantryModal?.classList.add("hidden");
  pantryModal?.setAttribute("aria-hidden", "true");
}

async function openQueueModal() {
  if (!authUser) {
    addMessage("bot", "Please login first.");
    return;
  }
  if (!queueModal) {
    queuePanel?.scrollIntoView({ behavior: "smooth", block: "start" });
    try {
      await refreshQueueList();
    } catch (err) {
      addMessage("bot", `Failed to load queued recipes: ${err.message}`);
    }
    return;
  }
  queueModal.classList.remove("hidden");
  queueModal.setAttribute("aria-hidden", "false");
  try {
    await refreshQueueList();
  } catch (err) {
    addMessage("bot", `Failed to load queued recipes: ${err.message}`);
  }
}

function closeQueueModal() {
  if (!queueModal) return;
  queueModal.classList.add("hidden");
  queueModal.setAttribute("aria-hidden", "true");
}

helpBtn.addEventListener("click", openHelpModal);
helpCloseBtn.addEventListener("click", closeHelpModal);
helpBackdrop.addEventListener("click", closeHelpModal);
aboutBtn.addEventListener("click", openAboutModal);
aboutCloseBtn.addEventListener("click", closeAboutModal);
aboutBackdrop.addEventListener("click", closeAboutModal);
recipeCloseBtn?.addEventListener("click", closeRecipeModal);
recipeBackdrop?.addEventListener("click", closeRecipeModal);
loginBtn?.addEventListener("click", openLoginModal);
loginCloseBtn?.addEventListener("click", closeLoginModal);
loginBackdrop?.addEventListener("click", closeLoginModal);
registerBtn?.addEventListener("click", openRegisterModal);
registerCloseBtn?.addEventListener("click", closeRegisterModal);
registerBackdrop?.addEventListener("click", closeRegisterModal);
prefsBtn?.addEventListener("click", openPrefsModal);
prefsCloseBtn?.addEventListener("click", closePrefsModal);
prefsBackdrop?.addEventListener("click", closePrefsModal);
pantryModalCloseBtn?.addEventListener("click", closePantryModal);
pantryModalBackdrop?.addEventListener("click", closePantryModal);
queueBtn?.addEventListener("click", openQueueModal);
queueCloseBtn?.addEventListener("click", closeQueueModal);
queueBackdrop?.addEventListener("click", closeQueueModal);
queueClearBtn?.addEventListener("click", async () => {
  try {
    ensureSignedIn();
    await api("/recipe-queue", { method: "DELETE" });
    await refreshQueueList();
    addMessage("bot", "Queued recipes cleared.");
  } catch (err) {
    addMessage("bot", `Failed to clear queued recipes: ${err.message}`);
  }
});
prefsForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setAuthFeedback(prefsFeedbackEl, "");
  try {
    ensureSignedIn();
    const data = await api("/auth/preferences", {
      method: "PATCH",
      body: JSON.stringify({ preferences: String(prefsInput?.value || "") }),
    });
    setAuth(authToken, data.user);
    setAuthFeedback(prefsFeedbackEl, "Preferences saved.", "success");
  } catch (err) {
    setAuthFeedback(prefsFeedbackEl, `Save failed: ${err.message}`, "error");
  }
});
prefsClearBtn?.addEventListener("click", async () => {
  setAuthFeedback(prefsFeedbackEl, "");
  try {
    ensureSignedIn();
    const data = await api("/auth/preferences", {
      method: "PATCH",
      body: JSON.stringify({ preferences: "" }),
    });
    setAuth(authToken, data.user);
    if (prefsInput) prefsInput.value = "";
    setAuthFeedback(prefsFeedbackEl, "Preferences cleared.", "success");
  } catch (err) {
    setAuthFeedback(prefsFeedbackEl, `Clear failed: ${err.message}`, "error");
  }
});

pantryList?.addEventListener("click", async (event) => {
  if (!event.target.closest(".pantry-summary-trigger")) return;
  await openPantryModal();
});

pantryModalList?.addEventListener("click", async (event) => {
  const bumpBtn = event.target.closest(".pantry-expiry-bump");
  if (bumpBtn) {
    const id = Number(bumpBtn.dataset.id);
    const bumpDays = Number(bumpBtn.dataset.days);
    if (Number.isNaN(id) || Number.isNaN(bumpDays) || bumpDays <= 0) return;
    const targetItem = lastPantryItems.find((item) => item.id === id);
    if (!targetItem) return;
    const nextExpiry = getExtendedExpiryDate(targetItem.expires_at, bumpDays);
    try {
      bumpBtn.disabled = true;
      await api(`/pantry/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ expires_at: nextExpiry }),
      });
      await refreshPantry();
      renderPantryModalList(lastPantryItems);
    } catch (err) {
      addMessage("bot", `Failed to update expiry: ${err.message}`);
      bumpBtn.disabled = false;
    }
    return;
  }

  const editBtn = event.target.closest(".pantry-item-edit");
  if (editBtn) {
    const id = Number(editBtn.dataset.id);
    if (Number.isNaN(id)) return;
    editingPantryItemId = editingPantryItemId === id ? null : id;
    renderPantryModalList(lastPantryItems);
    return;
  }

  const cancelBtn = event.target.closest(".pantry-item-cancel");
  if (cancelBtn) {
    stopEditingPantryItem();
    renderPantryModalList(lastPantryItems);
    return;
  }

  const removeBtn = event.target.closest(".pantry-item-remove");
  if (removeBtn) {
    const id = Number(removeBtn.dataset.id);
    if (Number.isNaN(id)) return;
    try {
      await api(`/pantry/${id}`, { method: "DELETE" });
      stopEditingPantryItem();
      await refreshPantry();
      renderPantryModalList(lastPantryItems);
      addMessage("bot", "Pantry item removed.");
    } catch (err) {
      addMessage("bot", `Failed to remove pantry item: ${err.message}`);
    }
  }
});

pantryModalList?.addEventListener("submit", async (event) => {
  const form = event.target.closest(".pantry-modal-edit-form");
  if (!form) return;
  event.preventDefault();
  const id = Number(form.dataset.id);
  if (Number.isNaN(id)) return;
  const name = normalizeName(String(form.elements.name?.value || ""));
  const quantity = Number(form.elements.quantity?.value);
  const unit = normalizeName(String(form.elements.unit?.value || "")) || "unit";
  const category = normalizeName(String(form.elements.category?.value || "")) || "uncategorized";

  if (!name) {
    addMessage("bot", "Name cannot be empty.");
    return;
  }
  if (Number.isNaN(quantity)) {
    addMessage("bot", "Quantity must be a number.");
    return;
  }

  const buttons = Array.from(form.querySelectorAll("button"));
  buttons.forEach((btn) => {
    btn.disabled = true;
  });
  try {
    await api(`/pantry/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name,
        quantity,
        unit,
        category,
      }),
    });
    stopEditingPantryItem();
    await refreshPantry();
    renderPantryModalList(lastPantryItems);
    addMessage("bot", "Pantry item updated.");
  } catch (err) {
    addMessage("bot", `Failed to update pantry item: ${err.message}`);
    buttons.forEach((btn) => {
      btn.disabled = false;
    });
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !helpModal.classList.contains("hidden")) {
    closeHelpModal();
  }
  if (event.key === "Escape" && !aboutModal.classList.contains("hidden")) {
    closeAboutModal();
  }
  if (event.key === "Escape" && recipeModal && !recipeModal.classList.contains("hidden")) {
    closeRecipeModal();
  }
  if (event.key === "Escape" && !loginModal.classList.contains("hidden")) {
    closeLoginModal();
  }
  if (event.key === "Escape" && !registerModal.classList.contains("hidden")) {
    closeRegisterModal();
  }
  if (event.key === "Escape" && !prefsModal.classList.contains("hidden")) {
    closePrefsModal();
  }
  if (event.key === "Escape" && pantryModal && !pantryModal.classList.contains("hidden")) {
    closePantryModal();
  }
  if (event.key === "Escape" && queueModal && !queueModal.classList.contains("hidden")) {
    closeQueueModal();
  }
});

useAiToggle.addEventListener("change", () => {
  if (useAiToggle.checked) {
    addMessage("bot", `Manual mode is ON. ${MANUAL_HELP}`);
  }
});

(async function init() {
  // Force a predictable startup mode; some browsers may restore prior toggle state.
  useAiToggle.checked = DEFAULT_MANUAL_MODE;
  if (DEFAULT_MANUAL_MODE) {
    addMessage("bot", `Manual mode ready. ${MANUAL_HELP}`);
  }
  renderAuthState();
  try {
    await api("/health");
    statusEl.textContent = "API online";
    const storedToken = localStorage.getItem(AUTH_TOKEN_KEY);
    if (storedToken) {
      authToken = storedToken;
      try {
        const me = await api("/auth/me");
        setAuth(storedToken, me.user);
        await refreshPantry();
        await refreshQueueList();
      } catch (_err) {
        clearAuth();
        renderPantry([]);
        addMessage("bot", "Session expired. Please login again.");
      }
    } else {
      renderPantry([]);
      addMessage("bot", "Login or register to access your pantry.");
    }
  } catch (err) {
    statusEl.textContent = "API offline";
    addMessage("bot", `Cannot connect to API: ${err.message}`);
  }
})();
