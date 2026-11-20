import { groceryCategories } from "../../supabase/functions/_shared/grocery-category";

export type Tab =
  | "home"
  | "shopping"
  | "movies"
  | "wishes"
  | "plans"
  | "menu"
  | "plants"
  | "budget";
export type Theme = "light" | "dark" | "system";
export type LightPalette = "sage" | "beige" | "rose" | "lavender" | "sky";
export type DarkPalette = "forest" | "obsidian" | "midnight" | "plum" | "espresso";
export type ThemePalette = LightPalette | DarkPalette;
export const categories = groceryCategories;
export const eventCategories = [
  "Побачення",
  "Поїздка",
  "Побут",
  "Свято",
  "Інше",
] as const;
export type Profile = { id: string; name: string; avatar_path: string | null };
export type ShoppingItem = {
  id: string;
  couple_id: string;
  name: string;
  quantity: number | null;
  menu_key?: string | null;
  unit: string;
  category: string;
  price: number | null;
  added_by: string;
  purchased: boolean;
  session_id: string | null;
  created_at: string;
  updated_at?: string;
};
export type ShoppingSession = {
  id: string;
  couple_id: string;
  created_at: string;
};
export type Wish = {
  id: string;
  couple_id: string;
  owner_id: string;
  name: string;
  price: number | null;
  url: string;
  priority: string;
  note: string;
  image_path: string | null;
  image_url: string;
  is_private: boolean;
  is_deleted?: boolean;
  fulfilled?: boolean;
  size: string;
  created_at: string;
};
export type Reservation = {
  id: string;
  wish_id: string;
  reserved_by: string;
  status: "planned" | "purchased";
  created_at: string;
};
export type Plan = {
  id: string;
  couple_id: string;
  title: string;
  date: string;
  time: string | null;
  all_day: boolean;
  location: string;
  url?: string;
  description: string;
  category: string;
  recurrence?: "none" | "weekly" | "monthly" | "yearly";
  created_by: string;
  created_at: string;
};
export type Plant = {
  id: string;
  couple_id: string;
  name: string;
  species: string;
  image_path: string | null;
  watering_interval_days: number;
  last_watered_at: string;
  wet_checked_at: string | null;
  light: string;
  watering_notes: string;
  info_url: string;
  added_by: string;
  created_at: string;
  updated_at: string;
};
export type PlantCareEvent = {
  id: string;
  plant_id: string;
  couple_id: string;
  actor_id: string;
  action: "watered" | "wet";
  occurred_at: string;
};
export type RecipeFavorite = { user_id: string; recipe_key: string };
export type RecipeCook = {
  id: string;
  couple_id: string;
  recipe_key: string;
  cooked_at: string;
  actor_id: string;
};
export type ProductHistory = {
  id: string;
  couple_id: string;
  name: string;
  category: string;
  unit: string;
};
export type Movie = {
  rating?: number | null;
  metadata_url?: string;
  id: string;
  couple_id: string;
  title: string;
  url: string;
  poster_url: string;
  year: number | null;
  genres: string;
  description: string;
  status: "planned" | "watched";
  added_by: string;
  created_at: string;
};
export type Activity = {
  id: string;
  couple_id: string;
  actor_id: string;
  kind:
    | "shopping"
    | "wishes"
    | "movies"
    | "events"
    | "recipes"
    | "plants"
    | "budget";
  action: "added" | "updated" | "deleted" | "purchased";
  entity_id: string | null;
  title: string;
  created_at: string;
};
export type ActivityRead = {
  id: string;
  activity_id: string;
  user_id: string;
  created_at: string;
};
export type NewMovie = Pick<
  Movie,
  | "title"
  | "url"
  | "poster_url"
  | "year"
  | "genres"
  | "description"
  | "status"
  | "rating"
  | "metadata_url"
>;
export type RecipeCategory = "side" | "protein" | "salad" | "main";
export type Recipe = {
  base_servings?: number;
  total_time_minutes?: number | null;
  difficulty?: string;
  notes?: string;
  structured_ingredients?: RecipeIngredient[] | null;
  id: string;
  couple_id: string;
  title: string;
  category: RecipeCategory;
  image_url: string;
  source_url: string;
  ingredients: string[];
  instructions: string[];
  added_by: string;
  created_at: string;
};
export type NewRecipe = Pick<
  Recipe,
  | "title"
  | "category"
  | "image_url"
  | "source_url"
  | "ingredients"
  | "instructions"
  | "base_servings"
  | "total_time_minutes"
  | "difficulty"
  | "notes"
  | "structured_ingredients"
>;
export type RecipeIngredient = {
  note?: string;
  name: string;
  quantity: number | null;
  unit: string;
  category: string;
};
export type MealPlanItem = {
  id: string;
  couple_id: string;
  catalog_id: string | null;
  recipe_id: string | null;
  servings: number;
  base_servings: number;
  ingredients: RecipeIngredient[];
  shopping_completed: boolean;
  added_by: string;
  created_at: string;
};
export type RecipeView = {
  key: string;
  catalogId?: string;
  customId?: string;
  sourceId?: string;
  sourceCategory?: string;
  title: string;
  category: RecipeCategory;
  image_url: string;
  source_url: string;
  baseServings: number;
  totalTimeMinutes: number | null;
  difficulty: string;
  ingredients: RecipeIngredient[];
  instructions: string[];
  notes: string;
  imageType: string;
  recommendedSideIds: string[];
  custom?: Recipe;
};
export type PantryItem = {
  id: string;
  couple_id: string;
  name: string;
  normalized_name: string;
  quantity: string;
  is_basic: boolean;
  added_by: string;
  created_at: string;
  updated_at: string;
};
export type NewPantryItem = {
  name: string;
  quantity?: string;
  is_basic?: boolean;
};
export type BudgetKind = "expense" | "income";
export type BudgetTransactionStatus = "confirmed" | "needs_review";
export type BudgetTransactionSource = "manual" | "apple_pay";
export type BudgetCategory = {
  id: string;
  couple_id: string;
  kind: BudgetKind;
  name: string;
  emoji: string;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at?: string;
};
export type NewBudgetCategory = {
  kind: BudgetKind;
  name: string;
  emoji: string;
};
export type BudgetTransaction = {
  id: string;
  couple_id: string;
  user_id: string;
  kind: BudgetKind;
  amount: number;
  merchant: string;
  note: string;
  category_key: string | null;
  status: BudgetTransactionStatus;
  source: BudgetTransactionSource;
  is_private: boolean;
  card_label?: string;
  occurred_on: string;
  occurred_at: string;
  created_at: string;
  updated_at?: string;
};
export type NewBudgetTransaction = {
  kind: BudgetKind;
  amount: number;
  merchant: string;
  note: string;
  category_key: string | null;
  status?: BudgetTransactionStatus;
  source?: BudgetTransactionSource;
  is_private: boolean;
  card_label?: string;
  occurred_on: string;
};
export type BudgetMerchantRule = {
  id: string;
  couple_id: string;
  merchant_pattern: string;
  normalized_pattern?: string;
  category_key: string;
  kind: BudgetKind;
  created_by: string | null;
  created_at: string;
  updated_at?: string;
};
export type BudgetSettings = {
  user_id: string;
  couple_id: string;
  share_income_with_partner: boolean;
  updated_at?: string;
};
export type BudgetTokenStatus = {
  has_token: boolean;
  token_hint: string;
  last_used_at: string | null;
  created_at: string | null;
};
export type BudgetRecurringPayment = {
  id: string;
  couple_id: string;
  user_id: string;
  title: string;
  kind: BudgetKind;
  amount: number;
  category_key: string;
  day_of_month: number;
  active: boolean;
  last_confirmed_month: string | null;
  last_skipped_month: string | null;
  created_at: string;
  updated_at?: string;
};
export type NewBudgetRecurringPayment = {
  title: string;
  kind: BudgetKind;
  amount: number;
  category_key: string;
  day_of_month: number;
};
export type Data = {
  mealPlan: MealPlanItem[];
  menuExcludedKeys?: string[];
  pantry: PantryItem[];
  recipes: Recipe[];
  profiles: Profile[];
  movies: Movie[];
  activities: Activity[];
  reads: ActivityRead[];
  shopping: ShoppingItem[];
  sessions: ShoppingSession[];
  wishes: Wish[];
  reservations: Reservation[];
  events: Plan[];
  plants: Plant[];
  plantCare: PlantCareEvent[];
  recipeFavorites: RecipeFavorite[];
  recipeCooks: RecipeCook[];
  history: ProductHistory[];
  budgetCategories: BudgetCategory[];
  budgetTransactions: BudgetTransaction[];
  budgetMerchantRules: BudgetMerchantRule[];
  budgetSettings: BudgetSettings[];
  budgetRecurring: BudgetRecurringPayment[];
};
export type Table =
  | "recipes"
  | "shopping_items"
  | "wishes"
  | "events"
  | "gift_reservations"
  | "movies";
export type NewShopping = Pick<
  ShoppingItem,
  "name" | "quantity" | "unit" | "category" | "price"
>;
export type NewWish = Pick<
  Wish,
  | "name"
  | "price"
  | "url"
  | "priority"
  | "note"
  | "image_path"
  | "image_url"
  | "is_private"
  | "size"
>;
export type NewPlan = Pick<
  Plan,
  | "title"
  | "date"
  | "time"
  | "all_day"
  | "location"
  | "url"
  | "description"
  | "category"
  | "recurrence"
>;
export type NewPlant = Pick<
  Plant,
  | "name"
  | "species"
  | "image_path"
  | "watering_interval_days"
  | "last_watered_at"
  | "light"
  | "watering_notes"
  | "info_url"
>;
