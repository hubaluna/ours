import { isPantryStaple } from "../../supabase/functions/_shared/grocery-category";
import type { PantryItem } from "./types";

export type BasicPantryOption = {
  name: string;
  hint: string;
};

export const BASIC_PANTRY_STAPLES: readonly BasicPantryOption[] = [
  { name: "Борошно", hint: "бакалія" },
  { name: "Рис", hint: "крупи" },
  { name: "Гречка", hint: "крупи" },
  { name: "Макарони", hint: "бакалія" },
  { name: "Вівсянка", hint: "крупи" },
  { name: "Вершкове масло", hint: "холодильник" },
  { name: "Яйця", hint: "холодильник" },
  { name: "Цибуля", hint: "овочі" },
  { name: "Часник", hint: "овочі" },
  { name: "Томатна паста", hint: "соуси" },
  { name: "Лавровий лист", hint: "спеції" },
  { name: "Паприка", hint: "спеції" },
  { name: "Сода", hint: "випічка" },
  { name: "Лимон", hint: "фрукти" },
];

export const ALWAYS_AT_HOME_LABELS = [
  "Сіль",
  "Перець чорний",
  "Олія",
  "Цукор",
  "Оцет",
  "Мед",
  "Вода",
] as const;

const QUANTITY_PREFIX_RE =
  /^(?:\d+(?:[.,]\d+)?(?:\/\d+)?|\d+\/\d+|[¼½¾])\s+(?:(?:ст|ч)\s*(?:л|ложк(?:а|и|у|ою)?)|(?:столов(?:а|ої|і)?|чайна)\s+ложк(?:а|и|у|ою)?|tbsp|tsp|tablespoons?|teaspoons?|кг|гр?\.?|г|мл|л|шт\.?|штук|уп\.?|зубчик(?:и|а|ів)?)\s+/i;

export function normalizePantryName(name: string): string {
  return name
    .trim()
    .toLocaleLowerCase("uk")
    .replace(/[’`]/g, "'")
    .replace(/[.,;:!?()[\]{}]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(QUANTITY_PREFIX_RE, "")
    .trim();
}

const TOKEN_ALIASES: Record<string, string> = {
  солі: "сіль",
  соль: "сіль",
  перцю: "перець",
  олії: "олія",
  олію: "олія",
  цукру: "цукор",
  рису: "рис",
  гречки: "гречка",
  макаронів: "макарони",
  пасти: "макарони",
  паста: "макарони",
  борошна: "борошно",
  вівсянки: "вівсянка",
  вівсяних: "вівсянка",
  масла: "масло",
  вершкового: "вершковий",
  яєць: "яйця",
  яйце: "яйця",
  яєч: "яйця",
  цибулі: "цибуля",
  цибулина: "цибуля",
  часнику: "часник",
  лимона: "лимон",
  лимону: "лимон",
  молока: "молоко",
  сметани: "сметана",
  картоплі: "картопля",
  моркви: "морква",
  помідорів: "помідори",
  помідора: "помідори",
  огірків: "огірки",
  огірка: "огірки",
  сиру: "сир",
  філе: "філе",
  томатної: "томатний",
  паприки: "паприка",
  лаврового: "лавровий",
  листа: "лист",
  листя: "лист",
  соди: "сода",
  меду: "мед",
  оцту: "оцет",
  води: "вода",
};

function stemToken(token: string): string {
  const mapped = TOKEN_ALIASES[token];
  if (mapped) return mapped;
  if (token.length >= 6) {
    return token.replace(/(ої|ого|ому|ою|их|іх|ами|ями|ів|їв|у|ю|і|и|а|о|е)$/, "");
  }
  if (token.length >= 4) {
    return token.replace(/(и|і|а|у|ю|о|е)$/, "");
  }
  return token;
}

function tokensFor(value: string): string[] {
  return normalizePantryName(value)
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.length > 1)
    .map(stemToken);
}

export function matchesPantryEntry(
  ingredientName: string,
  pantryName: string,
): boolean {
  const left = normalizePantryName(ingredientName);
  const right = normalizePantryName(pantryName);
  if (!left || !right) return false;
  if (left === right) return true;

  const leftTokens = tokensFor(left);
  const rightTokens = tokensFor(right);
  if (!leftTokens.length || !rightTokens.length) return false;

  if (rightTokens.length <= leftTokens.length) {
    return rightTokens.every((rt) =>
      leftTokens.some(
        (lt) =>
          lt === rt ||
          (lt.length >= 4 && rt.length >= 4 && (lt.startsWith(rt) || rt.startsWith(lt))),
      ),
    );
  }

  return leftTokens.every((lt) =>
    rightTokens.some(
      (rt) =>
        lt === rt ||
        (lt.length >= 4 && rt.length >= 4 && (lt.startsWith(rt) || rt.startsWith(lt))),
    ),
  );
}

export function isAtHomeIngredient(
  ingredientName: string,
  pantry: readonly PantryItem[] = [],
): boolean {
  if (isPantryStaple(ingredientName)) return true;
  return pantry.some((item) => matchesPantryEntry(ingredientName, item.name));
}
