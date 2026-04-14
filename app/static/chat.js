const chatLog = document.getElementById("chat-log");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const pantryList = document.getElementById("pantry-list");
const pantryMeta = document.getElementById("pantry-meta");
const statusEl = document.getElementById("api-status");
const useAiToggle = document.getElementById("use-ai-toggle");

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
  const matched = trimmed.match(/^(add|rm|list|drop_table)\b\s*(.*)$/i);
  if (!matched) return null;

  const cmd = matched[1].toLowerCase();
  const tail = matched[2] ? matched[2].trim() : "";

  if (cmd === "list" || cmd === "drop_table") {
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
  const parsed = parseManualCommand(message);
  if (!parsed) {
    addMessage("bot", "Manual mode commands: add item1,item2 | rm item1,item2 | list | drop_table");
    return;
  }

  if (parsed.command === "list") {
    await refreshPantry();
    addMessage("bot", "Pantry listed in the snapshot panel.");
    return;
  }

  if (parsed.command === "drop_table") {
    const result = await api("/pantry", { method: "DELETE" });
    await refreshPantry();
    addMessage("bot", `Pantry cleared. Deleted ${result.deleted} item(s).`);
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

useAiToggle.addEventListener("change", () => {
  if (useAiToggle.checked) {
    addMessage("bot", "Use AI is ON. Messages now go to /chat.");
  } else {
    addMessage("bot", "Use AI is OFF. Manual commands: add, rm, list, drop_table.");
  }
});

(async function init() {
  addMessage("bot", "Manual mode ready. Commands: add item1,item2 | rm item1,item2 | list | drop_table");
  try {
    await api("/health");
    statusEl.textContent = "API online";
    await refreshPantry();
  } catch (err) {
    statusEl.textContent = "API offline";
    addMessage("bot", `Cannot connect to API: ${err.message}`);
  }
})();
