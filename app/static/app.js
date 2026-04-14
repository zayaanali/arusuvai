const systemOutput = document.getElementById("system-output");
const pantryOutput = document.getElementById("pantry-output");
const recipeOutput = document.getElementById("recipe-output");
const shoppingOutput = document.getElementById("shopping-output");

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
    // Keep as text
  }

  if (!res.ok) {
    throw new Error(typeof data === "string" ? data : JSON.stringify(data));
  }
  return data;
}

function toNumber(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }
  return Number(value);
}

function show(target, data) {
  target.textContent = JSON.stringify(data, null, 2);
}

function ok(message, data) {
  show(systemOutput, { ok: true, message, data });
}

function fail(error) {
  show(systemOutput, { ok: false, error: error.message || String(error) });
}

function formToObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

document.getElementById("pantry-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const raw = formToObject(e.target);
  const payload = {
    name: raw.name,
    quantity: toNumber(raw.quantity),
    unit: raw.unit || null,
    expires_at: raw.expires_at || null,
    category: raw.category || null,
  };

  try {
    const created = await api("/pantry", { method: "POST", body: JSON.stringify(payload) });
    ok("Pantry item created", created);
    e.target.reset();
  } catch (err) {
    fail(err);
  }
});

document.getElementById("event-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const raw = formToObject(e.target);
  const payload = {
    pantry_item_id: Number(raw.pantry_item_id),
    event_type: raw.event_type,
    quantity_delta: Number(raw.quantity_delta),
    unit: raw.unit || null,
    source: raw.source || "manual",
  };

  try {
    const created = await api("/inventory-events", { method: "POST", body: JSON.stringify(payload) });
    ok("Inventory event created", created);
    e.target.reset();
  } catch (err) {
    fail(err);
  }
});

document.getElementById("recipe-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const raw = formToObject(e.target);
  const payload = {
    title: raw.title,
    instructions: raw.instructions,
    servings: toNumber(raw.servings),
    prep_minutes: toNumber(raw.prep_minutes),
    cook_minutes: toNumber(raw.cook_minutes),
    source_url: raw.source_url || null,
  };

  try {
    const created = await api("/recipes", { method: "POST", body: JSON.stringify(payload) });
    ok("Recipe created", created);
    e.target.reset();
  } catch (err) {
    fail(err);
  }
});

document.getElementById("recipe-ingredient-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const raw = formToObject(e.target);
  const recipeId = Number(raw.recipe_id);
  const payload = {
    recipe_id: recipeId,
    canonical_name: raw.canonical_name,
    raw_text: raw.raw_text || null,
    quantity: toNumber(raw.quantity),
    unit: raw.unit || null,
    optional: e.target.querySelector("input[name='optional']").checked,
  };

  try {
    const created = await api(`/recipes/${recipeId}/ingredients`, { method: "POST", body: JSON.stringify(payload) });
    ok("Recipe ingredient added", created);
    e.target.reset();
  } catch (err) {
    fail(err);
  }
});

document.getElementById("shopping-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const raw = formToObject(e.target);
  const payload = {
    name: raw.name,
    quantity: toNumber(raw.quantity),
    unit: raw.unit || null,
    checked: false,
  };

  try {
    const created = await api("/shopping-list", { method: "POST", body: JSON.stringify(payload) });
    ok("Shopping item created", created);
    e.target.reset();
  } catch (err) {
    fail(err);
  }
});

document.getElementById("alias-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const raw = formToObject(e.target);
  const payload = {
    alias: raw.alias,
    canonical_name: raw.canonical_name,
  };

  try {
    const created = await api("/ingredient-aliases", { method: "POST", body: JSON.stringify(payload) });
    ok("Alias created", created);
    e.target.reset();
  } catch (err) {
    fail(err);
  }
});

document.getElementById("refresh-pantry").addEventListener("click", async () => {
  try {
    const data = await api("/pantry");
    show(pantryOutput, data);
    ok("Pantry loaded", { count: data.length });
  } catch (err) {
    fail(err);
  }
});

document.getElementById("refresh-expiring").addEventListener("click", async () => {
  try {
    const data = await api("/pantry/expiring?days=7");
    show(pantryOutput, data);
    ok("Expiring pantry items loaded", { count: data.length, days: 7 });
  } catch (err) {
    fail(err);
  }
});

document.getElementById("refresh-recipes").addEventListener("click", async () => {
  try {
    const data = await api("/recipes");
    show(recipeOutput, data);
    ok("Recipes loaded", { count: data.length });
  } catch (err) {
    fail(err);
  }
});

document.getElementById("refresh-matches").addEventListener("click", async () => {
  try {
    const data = await api("/recipes/matches?min_match_percent=0");
    show(recipeOutput, data);
    ok("Recipe matches loaded", { count: data.length });
  } catch (err) {
    fail(err);
  }
});

document.getElementById("refresh-shopping").addEventListener("click", async () => {
  try {
    const data = await api("/shopping-list");
    show(shoppingOutput, data);
    ok("Shopping list loaded", { count: data.length });
  } catch (err) {
    fail(err);
  }
});

document.getElementById("refresh-shopping-open").addEventListener("click", async () => {
  try {
    const data = await api("/shopping-list?checked=false");
    show(shoppingOutput, data);
    ok("Open shopping items loaded", { count: data.length });
  } catch (err) {
    fail(err);
  }
});

(async function init() {
  try {
    const [pantry, recipes, shopping] = await Promise.all([api("/pantry"), api("/recipes"), api("/shopping-list")]);
    show(pantryOutput, pantry);
    show(recipeOutput, recipes);
    show(shoppingOutput, shopping);
    ok("Dashboard loaded", {
      pantry_items: pantry.length,
      recipes: recipes.length,
      shopping_items: shopping.length,
    });
  } catch (err) {
    fail(err);
  }
})();
