const API_BASE = "/api";

const pantryOutput = document.getElementById("pantry-output");
const shoppingOutput = document.getElementById("shopping-output");
const recipesOutput = document.getElementById("recipes-output");
const aiOutput = document.getElementById("ai-output");
const systemOutput = document.getElementById("system-output");

function apiUrl(path) {
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

async function api(path, options = {}) {
  const res = await fetch(apiUrl(path), {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(data?.error || JSON.stringify(data));
  }
  return data;
}

function show(target, data) {
  target.textContent = JSON.stringify(data, null, 2);
}

function status(message, data = null) {
  show(systemOutput, { message, data });
}

function numOrNull(value) {
  if (value === "" || value == null) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function sanitizeAiReply(reply) {
  const text = String(reply || "").trim();
  const compact = text.toLowerCase().replace(/[.!?]/g, "");
  if (!compact || compact === "done" || compact === "ok" || compact === "okay") {
    return "AI backend returned a placeholder response. Try again with a more specific pantry request.";
  }
  return text;
}

async function refreshPantry() {
  const items = await api("/pantry");
  show(pantryOutput, items);
  return items;
}

async function refreshShopping() {
  const items = await api("/shopping-list");
  show(shoppingOutput, items);
  return items;
}

async function refreshRecipes() {
  const items = await api("/recipes");
  show(recipesOutput, items);
  return items;
}

document.getElementById("pantry-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  try {
    const created = await api("/pantry", {
      method: "POST",
      body: JSON.stringify({
        name: form.get("name"),
        quantity: numOrNull(form.get("quantity")),
        unit: form.get("unit") || null,
        category: form.get("category") || null,
        expires_at: form.get("expires_at") || null,
      }),
    });
    status("Pantry item saved", created);
    event.target.reset();
    await refreshPantry();
  } catch (err) {
    status("Pantry add failed", err.message);
  }
});

document.getElementById("shopping-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  try {
    const created = await api("/shopping-list", {
      method: "POST",
      body: JSON.stringify({
        name: form.get("name"),
        quantity: numOrNull(form.get("quantity")),
        unit: form.get("unit") || null,
      }),
    });
    status("Shopping item saved", created);
    event.target.reset();
    await refreshShopping();
  } catch (err) {
    status("Shopping add failed", err.message);
  }
});

document.getElementById("recipe-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  try {
    const created = await api("/recipes", {
      method: "POST",
      body: JSON.stringify({
        title: form.get("title"),
        instructions: form.get("instructions"),
      }),
    });
    status("Recipe saved", created);
    event.target.reset();
    await refreshRecipes();
  } catch (err) {
    status("Recipe add failed", err.message);
  }
});

document.getElementById("ai-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  try {
    const reply = await api("/ai/chat", {
      method: "POST",
      body: JSON.stringify({ message: form.get("message") }),
    });
    show(aiOutput, { ...reply, reply: sanitizeAiReply(reply?.reply) });
    event.target.reset();
  } catch (err) {
    status("AI request failed", err.message);
  }
});

document.getElementById("refresh-pantry").addEventListener("click", async () => {
  try {
    await refreshPantry();
    status("Pantry refreshed");
  } catch (err) {
    status("Pantry refresh failed", err.message);
  }
});

document.getElementById("clear-pantry").addEventListener("click", async () => {
  try {
    const result = await api("/pantry", { method: "DELETE" });
    status("Pantry cleared", result);
    await refreshPantry();
  } catch (err) {
    status("Pantry clear failed", err.message);
  }
});

document.getElementById("expiring-7").addEventListener("click", async () => {
  try {
    const items = await api("/pantry/expiring?days=7");
    show(pantryOutput, items);
    status("Loaded expiring items", { days: 7, count: items.length });
  } catch (err) {
    status("Expiring query failed", err.message);
  }
});

document.getElementById("refresh-shopping").addEventListener("click", async () => {
  try {
    await refreshShopping();
    status("Shopping refreshed");
  } catch (err) {
    status("Shopping refresh failed", err.message);
  }
});

document.getElementById("refresh-recipes").addEventListener("click", async () => {
  try {
    await refreshRecipes();
    status("Recipes refreshed");
  } catch (err) {
    status("Recipe refresh failed", err.message);
  }
});

(async function init() {
  try {
    const health = await fetch("/health").then((r) => r.json());
    status("Server online", health);
    await Promise.all([refreshPantry(), refreshShopping(), refreshRecipes()]);
  } catch (err) {
    status("Initial load failed", err.message);
  }
})();
