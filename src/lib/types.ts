export type Tab = "home" | "shopping" | "movies" | "wishes" | "plans" | "menu";
export type Theme = "light" | "dark" | "system";
export const categories = [
  "Овочі та фрукти",
  "М’ясо та риба",
  "Молочні продукти",
  "Бакалія",
  "Напої",
  "Побутові товари",
  "Інше",
] as const;
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
  quantity: number;
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
>;
export type Data = {
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
  history: ProductHistory[];
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
  "name" | "price" | "url" | "priority" | "note" | "image_path" | "image_url"
>;
export type NewPlan = Pick<
  Plan,
  | "title"
  | "date"
  | "time"
  | "all_day"
  | "location"
  | "description"
  | "category"
>;
