export type Tab = "home" | "shopping" | "wishes" | "plans";
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
export type Data = {
  profiles: Profile[];
  shopping: ShoppingItem[];
  sessions: ShoppingSession[];
  wishes: Wish[];
  reservations: Reservation[];
  events: Plan[];
  history: ProductHistory[];
};
export type Table =
  "shopping_items" | "wishes" | "events" | "gift_reservations";
export type NewShopping = Pick<
  ShoppingItem,
  "name" | "quantity" | "unit" | "category" | "price"
>;
export type NewWish = Pick<
  Wish,
  "name" | "price" | "url" | "priority" | "note" | "image_path"
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
