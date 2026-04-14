from __future__ import annotations

from datetime import date, timedelta
from typing import Iterable

from sqlmodel import Session, select

from .models import IngredientAlias, PantryItem, RecipeIngredient


def normalize_name(name: str) -> str:
    return " ".join(name.strip().lower().split())


def canonicalize_name(session: Session, name: str) -> str:
    normalized = normalize_name(name)
    alias = session.exec(select(IngredientAlias).where(IngredientAlias.alias == normalized)).first()
    if alias:
        return alias.canonical_name
    return normalized


def expiring_cutoff(days: int) -> date:
    return date.today() + timedelta(days=days)


def pantry_name_set(items: Iterable[PantryItem]) -> set[str]:
    return {normalize_name(item.canonical_name) for item in items}


def score_recipe(recipe_ingredients: list[RecipeIngredient], pantry_names: set[str]) -> dict:
    required = [ri for ri in recipe_ingredients if not ri.optional]
    if not required:
        return {
            "match_percent": 100,
            "have_count": 0,
            "required_count": 0,
            "missing": [],
        }

    missing: list[str] = []
    have_count = 0

    for ri in required:
        canonical = normalize_name(ri.canonical_name)
        if canonical in pantry_names:
            have_count += 1
        else:
            missing.append(canonical)

    match_percent = round((have_count / len(required)) * 100)
    return {
        "match_percent": match_percent,
        "have_count": have_count,
        "required_count": len(required),
        "missing": missing,
    }
