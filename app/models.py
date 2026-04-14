from __future__ import annotations

from datetime import datetime, date
from typing import Optional

from sqlmodel import Field, SQLModel


class PantryItemBase(SQLModel):
    canonical_name: str = Field(index=True)
    display_name: Optional[str] = None
    quantity: float = 0
    unit: Optional[str] = None
    expires_at: Optional[date] = Field(default=None, index=True)
    category: Optional[str] = Field(default=None, index=True)


class PantryItem(PantryItemBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class PantryItemCreate(SQLModel):
    name: str
    quantity: Optional[float] = None
    unit: Optional[str] = None
    expires_at: Optional[date] = None
    category: Optional[str] = None


class PantryItemUpdate(SQLModel):
    name: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    expires_at: Optional[date] = None
    category: Optional[str] = None


class PantryItemRead(SQLModel):
    id: int
    name: str
    quantity: float
    unit: str
    expires_at: Optional[date] = None
    category: str
    created_at: datetime
    updated_at: datetime


class InventoryEventBase(SQLModel):
    pantry_item_id: int = Field(index=True)
    event_type: str = Field(index=True)  # add/use/discard/adjust
    quantity_delta: float
    unit: Optional[str] = None
    source: str = "manual"


class InventoryEvent(InventoryEventBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class InventoryEventCreate(InventoryEventBase):
    pass


class RecipeBase(SQLModel):
    title: str = Field(index=True)
    instructions: str
    servings: Optional[int] = None
    prep_minutes: Optional[int] = None
    cook_minutes: Optional[int] = None
    source_url: Optional[str] = None


class Recipe(RecipeBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class RecipeCreate(RecipeBase):
    pass


class RecipeUpdate(SQLModel):
    title: Optional[str] = None
    instructions: Optional[str] = None
    servings: Optional[int] = None
    prep_minutes: Optional[int] = None
    cook_minutes: Optional[int] = None
    source_url: Optional[str] = None


class RecipeIngredientBase(SQLModel):
    recipe_id: int = Field(index=True)
    canonical_name: str = Field(index=True)
    raw_text: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    optional: bool = False


class RecipeIngredient(RecipeIngredientBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)


class RecipeIngredientCreate(RecipeIngredientBase):
    pass


class ShoppingListItemBase(SQLModel):
    canonical_name: str = Field(index=True)
    quantity: Optional[float] = None
    unit: Optional[str] = None
    checked: bool = Field(default=False, index=True)


class ShoppingListItem(ShoppingListItemBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ShoppingListItemCreate(SQLModel):
    name: str
    quantity: Optional[float] = None
    unit: Optional[str] = None
    checked: Optional[bool] = None


class ShoppingListItemUpdate(SQLModel):
    name: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    checked: Optional[bool] = None


class ShoppingListItemRead(SQLModel):
    id: int
    name: str
    quantity: Optional[float] = None
    unit: Optional[str] = None
    checked: bool
    created_at: datetime


class IngredientAliasBase(SQLModel):
    alias: str = Field(index=True, unique=True)
    canonical_name: str = Field(index=True)


class IngredientAlias(IngredientAliasBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)


class IngredientAliasCreate(IngredientAliasBase):
    pass
