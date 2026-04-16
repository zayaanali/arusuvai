from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlmodel import Session, select

from .db import engine, get_session, init_db
from .models import (
    IngredientAlias,
    IngredientAliasCreate,
    InventoryEvent,
    InventoryEventCreate,
    PantryItem,
    PantryItemCreate,
    PantryItemRead,
    PantryItemUpdate,
    Recipe,
    RecipeCreate,
    RecipeIngredient,
    RecipeIngredientCreate,
    RecipeUpdate,
    ShoppingListItem,
    ShoppingListItemCreate,
    ShoppingListItemRead,
    ShoppingListItemUpdate,
)
from .services import canonicalize_name, expiring_cutoff, pantry_name_set, score_recipe

APP_VERSION = os.getenv("APP_VERSION", "0.1.0")
DEPLOY_ENV = os.getenv("DEPLOY_ENV", os.getenv("ENVIRONMENT", "unknown"))
GIT_SHA = os.getenv("GIT_SHA", "unknown")

app = FastAPI(title="Pantry Manager MVP", version=APP_VERSION)
BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR / "frontend"
DEFAULT_PANTRY_QUANTITY = 1.0
DEFAULT_PANTRY_UNIT = "unit"
DEFAULT_PANTRY_CATEGORY = "uncategorized"
DEFAULT_ALLOWED_ORIGINS = [
    "http://127.0.0.1:8000",
    "http://localhost:8000",
    "https://arusuvai.com",
    "https://www.arusuvai.com",
]
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ALLOW_ORIGINS", ",".join(DEFAULT_ALLOWED_ORIGINS)).split(",")
    if origin.strip()
]


@app.middleware("http")
async def api_prefix_middleware(request: Request, call_next):
    path = request.scope.get("path", "")
    if path == "/api":
        request.scope["path"] = "/"
    elif path.startswith("/api/"):
        request.scope["path"] = path[4:] or "/"
    return await call_next(request)


app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"^https://([a-z0-9-]+\.)?arusuvai\.pages\.dev$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    reply: str
    refresh_pantry: bool = False


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    with Session(engine) as session:
        _dedupe_pantry_items(session)


@app.get("/", include_in_schema=False)
def web_app() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "chat.html")


@app.get("/chat", include_in_schema=False)
def chat_web_app() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "chat.html")


@app.get("/manual", include_in_schema=False)
def manual_web_app() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/health")
def health():
    return {
        "status": "ok",
        "version": APP_VERSION,
        "environment": DEPLOY_ENV,
        "git_sha": GIT_SHA,
    }


@app.post("/chat", response_model=ChatResponse)
def chat_endpoint(payload: ChatRequest) -> ChatResponse:
    # Placeholder endpoint: frontend can toggle AI mode now, then backend logic/LLM can be added later.
    msg = payload.message.strip()
    if not msg:
        return ChatResponse(reply="Message was empty.", refresh_pantry=False)
    return ChatResponse(
        reply="AI mode is enabled, but the chatbot backend is not configured yet. Switch off 'Use AI' to run manual commands.",
        refresh_pantry=False,
    )


def _to_pantry_read(item: PantryItem) -> PantryItemRead:
    return PantryItemRead(
        id=item.id,
        name=item.canonical_name,
        quantity=item.quantity,
        unit=item.unit or DEFAULT_PANTRY_UNIT,
        expires_at=item.expires_at,
        category=item.category or DEFAULT_PANTRY_CATEGORY,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


def _to_shopping_read(item: ShoppingListItem) -> ShoppingListItemRead:
    return ShoppingListItemRead(
        id=item.id,
        name=item.canonical_name,
        quantity=item.quantity,
        unit=item.unit,
        checked=item.checked,
        created_at=item.created_at,
    )


def _dedupe_pantry_items(session: Session) -> None:
    items = list(session.exec(select(PantryItem).order_by(PantryItem.id)).all())
    by_name: dict[str, PantryItem] = {}
    changed = False

    for item in items:
        key = item.canonical_name.strip().lower()
        primary = by_name.get(key)
        if not primary:
            by_name[key] = item
            continue

        primary.quantity += item.quantity
        if (primary.expires_at is None) or (item.expires_at is not None and item.expires_at < primary.expires_at):
            primary.expires_at = item.expires_at
        if (not primary.unit or primary.unit == DEFAULT_PANTRY_UNIT) and item.unit:
            primary.unit = item.unit
        if (not primary.category or primary.category == DEFAULT_PANTRY_CATEGORY) and item.category:
            primary.category = item.category
        primary.updated_at = datetime.utcnow()
        session.delete(item)
        session.add(primary)
        changed = True

    if changed:
        session.commit()


# Pantry
@app.post("/pantry", response_model=PantryItemRead)
def create_pantry_item(payload: PantryItemCreate, session: Session = Depends(get_session)):
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="name cannot be empty")
    canonical = canonicalize_name(session, payload.name)
    quantity_to_add = payload.quantity if payload.quantity is not None else DEFAULT_PANTRY_QUANTITY
    existing = session.exec(select(PantryItem).where(PantryItem.canonical_name == canonical)).first()
    if existing:
        existing.quantity += quantity_to_add
        if payload.unit and payload.unit.strip():
            existing.unit = payload.unit.strip()
        if payload.category and payload.category.strip():
            existing.category = payload.category.strip()
        if payload.expires_at is not None:
            existing.expires_at = payload.expires_at
        existing.updated_at = datetime.utcnow()
        session.add(existing)
        session.commit()
        session.refresh(existing)
        return _to_pantry_read(existing)

    item = PantryItem(
        canonical_name=canonical,
        display_name=canonical,
        quantity=quantity_to_add,
        unit=(payload.unit.strip() if payload.unit else DEFAULT_PANTRY_UNIT),
        expires_at=payload.expires_at,
        category=(payload.category.strip() if payload.category else DEFAULT_PANTRY_CATEGORY),
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    return _to_pantry_read(item)


@app.get("/pantry", response_model=list[PantryItemRead])
def list_pantry_items(
    category: str | None = None,
    expiring_within_days: int | None = Query(default=None, ge=0, le=365),
    session: Session = Depends(get_session),
):
    stmt = select(PantryItem)
    if category:
        stmt = stmt.where(PantryItem.category == category)
    if expiring_within_days is not None:
        stmt = stmt.where(PantryItem.expires_at.is_not(None)).where(PantryItem.expires_at <= expiring_cutoff(expiring_within_days))
    items = list(session.exec(stmt).all())
    return [_to_pantry_read(item) for item in items]


@app.get("/pantry/expiring", response_model=list[PantryItemRead])
def pantry_expiring(days: int = Query(default=7, ge=0, le=365), session: Session = Depends(get_session)):
    stmt = (
        select(PantryItem)
        .where(PantryItem.expires_at.is_not(None))
        .where(PantryItem.expires_at <= expiring_cutoff(days))
        .order_by(PantryItem.expires_at)
    )
    items = list(session.exec(stmt).all())
    return [_to_pantry_read(item) for item in items]


@app.patch("/pantry/{item_id}", response_model=PantryItemRead)
def update_pantry_item(item_id: int, payload: PantryItemUpdate, session: Session = Depends(get_session)):
    item = session.get(PantryItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Pantry item not found")

    updates = payload.model_dump(exclude_unset=True)
    if "name" in updates:
        if not updates["name"] or not updates["name"].strip():
            raise HTTPException(status_code=400, detail="name cannot be empty")
        updates["canonical_name"] = canonicalize_name(session, updates.pop("name"))
        duplicate = session.exec(
            select(PantryItem).where(PantryItem.canonical_name == updates["canonical_name"]).where(PantryItem.id != item.id)
        ).first()
        if duplicate:
            raise HTTPException(status_code=409, detail="Pantry item with this name already exists")
        updates["display_name"] = updates["canonical_name"]
    if "unit" in updates:
        updates["unit"] = updates["unit"].strip() if updates["unit"] else DEFAULT_PANTRY_UNIT
    if "category" in updates:
        updates["category"] = updates["category"].strip() if updates["category"] else DEFAULT_PANTRY_CATEGORY
    if "quantity" in updates and updates["quantity"] is None:
        updates["quantity"] = DEFAULT_PANTRY_QUANTITY
    for key, value in updates.items():
        setattr(item, key, value)
    item.updated_at = datetime.utcnow()
    session.add(item)
    session.commit()
    session.refresh(item)
    return _to_pantry_read(item)


@app.delete("/pantry")
def clear_pantry(session: Session = Depends(get_session)):
    items = list(session.exec(select(PantryItem)).all())
    count = 0
    for item in items:
        session.delete(item)
        count += 1
    session.commit()
    return {"deleted": count}


@app.post("/pantry/clear", deprecated=True)
def clear_pantry_via_post(response: Response, session: Session = Depends(get_session)):
    response.headers["Deprecation"] = "true"
    response.headers["Sunset"] = "Wed, 30 Sep 2026 00:00:00 GMT"
    response.headers["Link"] = '</pantry>; rel="successor-version"'
    return clear_pantry(session)


@app.delete("/pantry/{item_id}")
def delete_pantry_item(item_id: int, session: Session = Depends(get_session)):
    item = session.get(PantryItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Pantry item not found")
    session.delete(item)
    session.commit()
    return {"deleted": item_id}


# Inventory events
@app.post("/inventory-events", response_model=InventoryEvent)
def create_inventory_event(payload: InventoryEventCreate, session: Session = Depends(get_session)):
    item = session.get(PantryItem, payload.pantry_item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Pantry item not found")

    event = InventoryEvent(**payload.model_dump())
    item.quantity += payload.quantity_delta
    item.updated_at = datetime.utcnow()

    session.add(event)
    session.add(item)
    session.commit()
    session.refresh(event)
    return event


@app.get("/inventory-events", response_model=list[InventoryEvent])
def list_inventory_events(pantry_item_id: int | None = None, session: Session = Depends(get_session)):
    stmt = select(InventoryEvent)
    if pantry_item_id is not None:
        stmt = stmt.where(InventoryEvent.pantry_item_id == pantry_item_id)
    stmt = stmt.order_by(InventoryEvent.created_at.desc())
    return list(session.exec(stmt).all())


# Recipes
@app.post("/recipes", response_model=Recipe)
def create_recipe(payload: RecipeCreate, session: Session = Depends(get_session)):
    recipe = Recipe(**payload.model_dump())
    session.add(recipe)
    session.commit()
    session.refresh(recipe)
    return recipe


@app.get("/recipes", response_model=list[Recipe])
def list_recipes(session: Session = Depends(get_session)):
    return list(session.exec(select(Recipe)).all())


@app.get("/recipes/{recipe_id}", response_model=Recipe)
def get_recipe(recipe_id: int, session: Session = Depends(get_session)):
    recipe = session.get(Recipe, recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return recipe


@app.patch("/recipes/{recipe_id}", response_model=Recipe)
def update_recipe(recipe_id: int, payload: RecipeUpdate, session: Session = Depends(get_session)):
    recipe = session.get(Recipe, recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")

    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(recipe, key, value)

    session.add(recipe)
    session.commit()
    session.refresh(recipe)
    return recipe


@app.delete("/recipes/{recipe_id}")
def delete_recipe(recipe_id: int, session: Session = Depends(get_session)):
    recipe = session.get(Recipe, recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")

    ingredients = session.exec(select(RecipeIngredient).where(RecipeIngredient.recipe_id == recipe_id)).all()
    for ingredient in ingredients:
        session.delete(ingredient)
    session.delete(recipe)
    session.commit()
    return {"deleted": recipe_id}


@app.post("/recipes/{recipe_id}/ingredients", response_model=RecipeIngredient)
def add_recipe_ingredient(recipe_id: int, payload: RecipeIngredientCreate, session: Session = Depends(get_session)):
    recipe = session.get(Recipe, recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    if payload.recipe_id != recipe_id:
        raise HTTPException(status_code=400, detail="recipe_id in body must match path")

    canonical = canonicalize_name(session, payload.canonical_name)
    ingredient = RecipeIngredient(**payload.model_dump(), canonical_name=canonical)
    session.add(ingredient)
    session.commit()
    session.refresh(ingredient)
    return ingredient


@app.get("/recipes/{recipe_id}/ingredients", response_model=list[RecipeIngredient])
def list_recipe_ingredients(recipe_id: int, session: Session = Depends(get_session)):
    recipe = session.get(Recipe, recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")

    stmt = select(RecipeIngredient).where(RecipeIngredient.recipe_id == recipe_id)
    return list(session.exec(stmt).all())


@app.get("/recipes/matches")
def recipe_matches(
    min_match_percent: int = Query(default=0, ge=0, le=100),
    max_missing: int | None = Query(default=None, ge=0, le=100),
    session: Session = Depends(get_session),
):
    recipes = list(session.exec(select(Recipe)).all())
    pantry_items = list(session.exec(select(PantryItem)).all())
    pantry_names = pantry_name_set(pantry_items)

    out = []
    for recipe in recipes:
        ingredients = list(session.exec(select(RecipeIngredient).where(RecipeIngredient.recipe_id == recipe.id)).all())
        score = score_recipe(ingredients, pantry_names)
        if score["match_percent"] < min_match_percent:
            continue
        if max_missing is not None and len(score["missing"]) > max_missing:
            continue
        out.append(
            {
                "recipe_id": recipe.id,
                "title": recipe.title,
                **score,
            }
        )

    out.sort(key=lambda x: (x["match_percent"], -x["required_count"]), reverse=True)
    return out


# Shopping list
@app.post("/shopping-list", response_model=ShoppingListItemRead)
def create_shopping_item(payload: ShoppingListItemCreate, session: Session = Depends(get_session)):
    if not payload.name or not payload.name.strip():
        raise HTTPException(status_code=400, detail="name cannot be empty")
    canonical = canonicalize_name(session, payload.name)
    item = ShoppingListItem(
        canonical_name=canonical,
        quantity=payload.quantity,
        unit=payload.unit.strip() if payload.unit else None,
        checked=payload.checked if payload.checked is not None else False,
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    return _to_shopping_read(item)


@app.get("/shopping-list", response_model=list[ShoppingListItemRead])
def list_shopping_items(checked: bool | None = None, session: Session = Depends(get_session)):
    stmt = select(ShoppingListItem)
    if checked is not None:
        stmt = stmt.where(ShoppingListItem.checked == checked)
    items = list(session.exec(stmt).all())
    return [_to_shopping_read(item) for item in items]


@app.patch("/shopping-list/{item_id}", response_model=ShoppingListItemRead)
def update_shopping_item(item_id: int, payload: ShoppingListItemUpdate, session: Session = Depends(get_session)):
    item = session.get(ShoppingListItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Shopping item not found")

    updates = payload.model_dump(exclude_unset=True)
    if "name" in updates:
        if not updates["name"] or not updates["name"].strip():
            raise HTTPException(status_code=400, detail="name cannot be empty")
        updates["canonical_name"] = canonicalize_name(session, updates.pop("name"))
    if "unit" in updates and updates["unit"] is not None:
        updates["unit"] = updates["unit"].strip() or None
    for key, value in updates.items():
        setattr(item, key, value)

    session.add(item)
    session.commit()
    session.refresh(item)
    return _to_shopping_read(item)


@app.delete("/shopping-list/{item_id}")
def delete_shopping_item(item_id: int, session: Session = Depends(get_session)):
    item = session.get(ShoppingListItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Shopping item not found")
    session.delete(item)
    session.commit()
    return {"deleted": item_id}


# Aliases
@app.post("/ingredient-aliases", response_model=IngredientAlias)
def create_alias(payload: IngredientAliasCreate, session: Session = Depends(get_session)):
    alias = IngredientAlias(alias=payload.alias.strip().lower(), canonical_name=payload.canonical_name.strip().lower())
    session.add(alias)
    session.commit()
    session.refresh(alias)
    return alias


@app.get("/ingredient-aliases", response_model=list[IngredientAlias])
def list_aliases(session: Session = Depends(get_session)):
    return list(session.exec(select(IngredientAlias)).all())
