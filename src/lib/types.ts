import { groceryCategories } from "../../supabase/functions/_shared/grocery-category";

export type Tab = "home" | "shopping" | "movies" | "wishes" | "plans" | "menu";
export type Theme = "light" | "dark" | "system";
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
  size: string;
  created_at: string;
};
export type Place = {
  id: string;
  couple_id: string;
  title: string;
  type: "Кінотеатр" | "Театр" | "Музей" | "Виставка" | "Парк" | "Зоопарк" | "Інше";
  address: string;
  url: string;
  planned_date: string | null;
  description: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};
export type NewPlace = Pick<
  Place,
  "title" | "type" | "address" | "url" | "planned_date" | "description"
>;
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
  created_by: string;
  created_at: string;
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
  kind: "shopping" | "wishes" | "movies" | "events" | "recipes";
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
export type Data = {
  mealPlan: MealPlanItem[];
  menuExcludedKeys?: string[];
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
  places: Place[];
  history: ProductHistory[];
};
export type Table =
  | "recipes"
  | "shopping_items"
  | "wishes"
  | "events"
  | "gift_reservations"
  | "movies"
  | "places";
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
>;
