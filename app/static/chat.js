const chatLog = document.getElementById("chat-log");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const pantryList = document.getElementById("pantry-list");
const pantryMeta = document.getElementById("pantry-meta");
const statusEl = document.getElementById("api-status");
const useAiToggle = document.getElementById("use-ai-toggle");
const helpBtn = document.getElementById("help-btn");
const helpModal = document.getElementById("help-modal");
const helpBackdrop = document.getElementById("help-backdrop");
const helpCloseBtn = document.getElementById("help-close");
const aboutBtn = document.getElementById("about-btn");
const aboutModal = document.getElementById("about-modal");
const aboutBackdrop = document.getElementById("about-backdrop");
const aboutCloseBtn = document.getElementById("about-close");
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
  Shows all pantry items in the snapshot panel.

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

Support
- help
  Shows this guide.`;

function addMessage(role, text) {
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  el.textContent = text;
  chatLog.appendChild(el);
  chatLog.scrollTop = chatLog.scrollHeight;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const text = await res.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {
    // keep text
  }
  if (!res.ok) {
    throw new Error(typeof data === "string" ? data : JSON.stringify(data));
  }
  return data;
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

  const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name));
  for (const item of sorted) {
    const card = document.createElement("div");
    card.className = "pantry-item";

    const days = daysUntil(item.expires_at);
    const expiryLine = !item.expires_at
      ? "No expiry date"
      : days < 0
        ? `<span class=\"warn\">Expired ${Math.abs(days)} day(s) ago</span>`
        : days <= 7
          ? `<span class=\"warn\">Expires in ${days} day(s)</span>`
          : `Expires in ${days} day(s)`;

    card.innerHTML = `
      <h3>${item.name}</h3>
      <p><strong>${item.quantity}</strong> ${item.unit}</p>
      <p>${expiryLine}</p>
      <span class="tag">${item.category}</span>
    `;
    pantryList.appendChild(card);
  }
}

async function refreshPantry() {
  const items = await api("/pantry");
  renderPantry(items);
  return items;
}

async function runManualCommand(message) {
  const trimmed = message.trim();
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
    addMessage("bot", "Pantry listed in the snapshot panel.");
    return;
  }

  if (parsed.command === "help") {
    addMessage("bot", HELP_TEXT);
    return;
  }

  if (parsed.command === "drop_table") {
    const result = await api("/pantry", { method: "DELETE" });
    await refreshPantry();
    addMessage("bot", `Pantry cleared. Deleted ${result.deleted} item(s).`);
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
    await api("/inventory-events", {
      method: "POST",
      body: JSON.stringify({
        pantry_item_id: existing.id,
        event_type: "adjust",
        quantity_delta: delta,
        unit: existing.unit || null,
        source: "manual_chat",
      }),
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

    await api("/inventory-events", {
      method: "POST",
      body: JSON.stringify({
        pantry_item_id: existing.id,
        event_type: parsed.command,
        quantity_delta: -qty,
        unit: existing.unit || null,
        source: "manual_chat",
      }),
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
  const data = await api("/chat", {
    method: "POST",
    body: JSON.stringify({ message }),
  });

  addMessage("bot", data.reply || "AI response received.");
  if (data.refresh_pantry) {
    await refreshPantry();
  }
}

async function handleChat(message) {
  addMessage("user", message);
  if (useAiToggle.checked) {
    await runAiMode(message);
  } else {
    await runManualCommand(message);
  }
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

document.querySelectorAll(".quick-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const prompt = btn.dataset.prompt || "";
    try {
      await handleChat(prompt);
    } catch (err) {
      addMessage("bot", `Error: ${err.message}`);
    }
  });
});

document.getElementById("refresh-pantry").addEventListener("click", async () => {
  try {
    await refreshPantry();
    addMessage("bot", "Pantry refreshed.");
  } catch (err) {
    addMessage("bot", `Refresh failed: ${err.message}`);
  }
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

helpBtn.addEventListener("click", openHelpModal);
helpCloseBtn.addEventListener("click", closeHelpModal);
helpBackdrop.addEventListener("click", closeHelpModal);
aboutBtn.addEventListener("click", openAboutModal);
aboutCloseBtn.addEventListener("click", closeAboutModal);
aboutBackdrop.addEventListener("click", closeAboutModal);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !helpModal.classList.contains("hidden")) {
    closeHelpModal();
  }
  if (event.key === "Escape" && !aboutModal.classList.contains("hidden")) {
    closeAboutModal();
  }
});

useAiToggle.addEventListener("change", () => {
  if (useAiToggle.checked) {
    addMessage("bot", "Use AI is ON. Messages now go to /chat.");
  } else {
    addMessage("bot", `Use AI is OFF. ${MANUAL_HELP}`);
  }
});

(async function init() {
  addMessage("bot", `Manual mode ready. ${MANUAL_HELP}`);
  try {
    await api("/health");
    statusEl.textContent = "API online";
    await refreshPantry();
  } catch (err) {
    statusEl.textContent = "API offline";
    addMessage("bot", `Cannot connect to API: ${err.message}`);
  }
})();
