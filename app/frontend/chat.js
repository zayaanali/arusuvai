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
const queueBtn = document.getElementById("queue-btn");
const queuePanel = document.getElementById("queue-panel");
const queueModal = document.getElementById("queue-modal");
const queueBackdrop = document.getElementById("queue-backdrop");
const queueCloseBtn = document.getElementById("queue-close");
const queueRefreshBtn = document.getElementById("queue-refresh");
const queueClearBtn = document.getElementById("queue-clear");
const queueListEl = document.getElementById("queue-list");
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

function extractQueuedRecipesFromText(text) {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const recipes = [];
  let current = null;
  const isDetailPrefix = (value) => /^(pantry items?|missing items?|ingredients?|steps?)\s*:/i.test(value);
  const normalizeTitle = (line) =>
    line
      .replace(/^#{1,6}\s+/, "")
      .replace(/^\d+\.\s+/, "")
      .replace(/^\*\*(.+?)\*\*$/, "$1")
      .replace(/:$/, "")
      .trim();
  const isPossibleTitleLine = (line) => {
    if (!line || line.length > 120) return false;
    if (isDetailPrefix(line)) return false;
    if (/^[-*]\s+/.test(line)) return false;
    if (/^\d+\.\s+/.test(line)) return true;
    if (/^#{1,6}\s+/.test(line)) return true;
    if (/^\*\*.+\*\*$/.test(line)) return true;
    return /^[A-Z][\w\s'()/-]{2,}$/.test(line);
  };

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

    const titleCandidate = normalizeTitle(line);
    const next = i + 1 < lines.length ? lines[i + 1].trim().toLowerCase() : "";
    const looksLikeTitle =
      isPossibleTitleLine(line) &&
      (isDetailPrefix(next) || !next || /^[-*]\s+/.test(next));

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

function addMessage(role, text) {
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  if (role === "bot") {
    el.innerHTML = renderBotMessageHtml(text);
    const recipeCandidates = extractQueuedRecipesFromText(text);
    if (recipeCandidates.length) {
      const buildQueueButton = (recipe) => {
        const queueButton = document.createElement("button");
        queueButton.type = "button";
        queueButton.className = "ghost recipe-inline-queue-btn";
        queueButton.textContent = "Add to queue";
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
      };

      const titleEls = Array.from(el.querySelectorAll(".recipe-title"));
      const inlineCount = Math.min(titleEls.length, recipeCandidates.length);
      for (let i = 0; i < inlineCount; i += 1) {
        const row = document.createElement("div");
        row.className = "recipe-title-row";
        const titleEl = titleEls[i];
        titleEl.parentNode.insertBefore(row, titleEl);
        row.appendChild(titleEl);
        row.appendChild(buildQueueButton(recipeCandidates[i]));
      }

      const actions = document.createElement("div");
      actions.className = "msg-actions";
      for (let i = inlineCount; i < recipeCandidates.length; i += 1) {
        actions.appendChild(buildQueueButton(recipeCandidates[i]));
      }

      if (recipeCandidates.length > 1) {
        const queueAllBtn = document.createElement("button");
        queueAllBtn.type = "button";
        queueAllBtn.className = "ghost";
        queueAllBtn.textContent = "Add all to queue";
        queueAllBtn.addEventListener("click", async () => {
          try {
            ensureSignedIn();
            queueAllBtn.disabled = true;
            const result = await api("/recipe-queue/bulk", {
              method: "POST",
              body: JSON.stringify({ recipes: recipeCandidates }),
            });
            await refreshQueueList().catch(() => {});
            addMessage("bot", `Queued ${Number(result?.added || recipeCandidates.length)} recipe(s).`);
          } catch (err) {
            addMessage("bot", `Failed to queue recipes: ${err.message}`);
          } finally {
            queueAllBtn.disabled = false;
          }
        });
        actions.appendChild(queueAllBtn);
      }
      if (actions.childElementCount) el.appendChild(actions);
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
      <p>${escapeHtml(row.notes || "")}</p>
      <div class="prefs-actions">
        <button type="button" class="ghost queue-remove" data-id="${row.id}">Remove</button>
      </div>
    `;
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

function startEditingPantryItem(itemId) {
  editingPantryItemId = itemId;
  renderPantry(lastPantryItems);
}

function stopEditingPantryItem() {
  editingPantryItemId = null;
  renderPantry(lastPantryItems);
}

function renderPantry(items) {
  pantryList.innerHTML = "";

  if (!items.length) {
    pantryMeta.textContent = "No pantry items yet.";
    const empty = document.createElement("div");
    empty.className = "pantry-item";
    empty.innerHTML = "<h3>Empty pantry</h3><p>Try: <strong>add green beans,corn</strong></p>";
    pantryList.appendChild(empty);
    return;
  }

  pantryMeta.textContent = `${items.length} item${items.length === 1 ? "" : "s"} in pantry`;

  const displayName = (item) => item?.name || item?.canonical_name || item?.display_name || "unnamed item";
  const normalizeCategory = (item) => normalizeName(item?.category || "") || "uncategorized";
  const titleCase = (value) =>
    String(value || "")
      .split(" ")
      .filter(Boolean)
      .map((word) => word[0].toUpperCase() + word.slice(1))
      .join(" ");

  const sorted = [...items].sort((a, b) => {
    const catCompare = normalizeCategory(a).localeCompare(normalizeCategory(b));
    if (catCompare !== 0) return catCompare;
    return displayName(a).localeCompare(displayName(b));
  });

  const grouped = new Map();
  for (const item of sorted) {
    const category = normalizeCategory(item);
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category).push(item);
  }

  const categoryOrder = Array.from(grouped.keys()).sort((a, b) => {
    if (a === "uncategorized") return 1;
    if (b === "uncategorized") return -1;
    return a.localeCompare(b);
  });

  for (const category of categoryOrder) {
    const section = document.createElement("section");
    section.className = "pantry-group";
    const groupItems = grouped.get(category) || [];
    section.innerHTML = `
      <h3 class="pantry-group-title">
        <span>${titleCase(category)}</span>
        <span class="pantry-group-count">${groupItems.length}</span>
      </h3>
    `;

    for (const item of groupItems) {
      const card = document.createElement("div");
      card.className = "pantry-item";
      const isEditing = editingPantryItemId === item.id;

      const days = daysUntil(item.expires_at);
      const expiryLine = !item.expires_at
        ? "No expiry"
        : days < 0
          ? `<span class=\"warn\">Expired ${Math.abs(days)}d ago</span>`
          : days <= 7
            ? `<span class=\"warn\">Expires in ${days}d</span>`
            : `Expires in ${days}d`;

      card.innerHTML = `
        <div class="pantry-item-row">
          <div class="pantry-item-main">
            <h4 class="pantry-item-name">${escapeHtml(displayName(item))}</h4>
            <p><strong>${item.quantity}</strong> ${item.unit || "unit"} • ${expiryLine}</p>
          </div>
        </div>
      `;

      const actions = document.createElement("div");
      actions.className = "pantry-actions";
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "ghost pantry-edit-btn";
      editBtn.textContent = isEditing ? "Close" : "Edit";
      editBtn.addEventListener("click", () => {
        if (isEditing) {
          stopEditingPantryItem();
          return;
        }
        startEditingPantryItem(item.id);
      });
      actions.appendChild(editBtn);
      card.querySelector(".pantry-item-row")?.appendChild(actions);

      if (isEditing) {
        const nameEl = card.querySelector(".pantry-item-name");
        if (nameEl) {
          nameEl.setAttribute("contenteditable", "true");
          nameEl.setAttribute("spellcheck", "false");
          nameEl.setAttribute("tabindex", "0");
          nameEl.classList.add("pantry-item-name--editable");
          nameEl.setAttribute("title", "Click to rename");
          nameEl.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              nameEl.blur();
            }
          });
        }

        const form = document.createElement("form");
        form.className = "pantry-edit-form";
        form.innerHTML = `
        <label>
          Category
          <input name="category" value="${escapeHtml(item.category || "")}" placeholder="uncategorized" />
        </label>
        <label>
          Unit
          <input name="unit" value="${escapeHtml(item.unit || "")}" placeholder="unit" />
        </label>
        <label>
          Expiry
          <input name="expires_at" type="date" value="${escapeHtml(item.expires_at || "")}" />
        </label>
        <div class="pantry-edit-actions">
          <button type="submit">Save</button>
          <button type="button" class="ghost pantry-cancel-btn">Cancel</button>
        </div>
      `;

        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          const updatedName = normalizeName(String(nameEl?.textContent || ""));
          const categoryInput = String(form.elements.category?.value || "");
          const unitInput = String(form.elements.unit?.value || "");
          const expiryInput = String(form.elements.expires_at?.value || "").trim();
          const category = normalizeName(categoryInput) || "uncategorized";
          const unit = normalizeName(unitInput) || "unit";
          if (!updatedName) {
            addMessage("bot", "Name cannot be empty.");
            return;
          }
          if (expiryInput && !isValidDateInput(expiryInput)) {
            addMessage("bot", "Date must be YYYY-MM-DD.");
            return;
          }

          const buttons = Array.from(form.querySelectorAll("button"));
          buttons.forEach((btn) => {
            btn.disabled = true;
          });
          try {
            await api(`/pantry/${item.id}`, {
              method: "PATCH",
              body: JSON.stringify({
                name: updatedName,
                category,
                unit,
                expires_at: expiryInput || null,
              }),
            });
            editingPantryItemId = null;
            await refreshPantry();
            addMessage(
              "bot",
              `Updated ${displayName(item)}${updatedName !== normalizeName(displayName(item)) ? ` -> ${updatedName}` : ""}: category=${category}, unit=${unit}, expiry=${expiryInput || "none"}.`
            );
          } catch (err) {
            addMessage("bot", `Failed to update ${displayName(item)}: ${err.message}`);
            buttons.forEach((btn) => {
              btn.disabled = false;
            });
          }
        });

        form.querySelector(".pantry-cancel-btn")?.addEventListener("click", () => {
          stopEditingPantryItem();
        });
        card.appendChild(form);
      }

      section.appendChild(card);
    }
    pantryList.appendChild(section);
  }
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

document.getElementById("refresh-pantry").addEventListener("click", async () => {
  try {
    await refreshPantry();
    addMessage("bot", "Pantry refreshed.");
  } catch (err) {
    addMessage("bot", `Refresh failed: ${err.message}`);
  }
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
    setAuthFeedback(loginFeedbackEl, `Welcome back, ${data.user.username}.`, "success");
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
    setAuthFeedback(registerFeedbackEl, `Account created for ${data.user.username}.`, "success");
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
loginBtn?.addEventListener("click", openLoginModal);
loginCloseBtn?.addEventListener("click", closeLoginModal);
loginBackdrop?.addEventListener("click", closeLoginModal);
registerBtn?.addEventListener("click", openRegisterModal);
registerCloseBtn?.addEventListener("click", closeRegisterModal);
registerBackdrop?.addEventListener("click", closeRegisterModal);
prefsBtn?.addEventListener("click", openPrefsModal);
prefsCloseBtn?.addEventListener("click", closePrefsModal);
prefsBackdrop?.addEventListener("click", closePrefsModal);
queueBtn?.addEventListener("click", openQueueModal);
queueCloseBtn?.addEventListener("click", closeQueueModal);
queueBackdrop?.addEventListener("click", closeQueueModal);
queueRefreshBtn?.addEventListener("click", async () => {
  try {
    await refreshQueueList();
  } catch (err) {
    addMessage("bot", `Failed to refresh queued recipes: ${err.message}`);
  }
});
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
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !helpModal.classList.contains("hidden")) {
    closeHelpModal();
  }
  if (event.key === "Escape" && !aboutModal.classList.contains("hidden")) {
    closeAboutModal();
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
