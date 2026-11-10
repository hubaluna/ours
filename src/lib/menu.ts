export const menuOptions = {
  side: [
    "Картопляне пюре",
    "Гречка з печерицями",
    "Рис із зеленню",
    "Булгур з овочами",
    "Печена картопля",
    "Кускус із лимоном",
    "Паста з оливковою олією",
  ],
  protein: [
    "Курка з травами",
    "Запечений лосось",
    "Індичка в духовці",
    "Тушкована яловичина",
    "Хек із лимоном",
    "Курячі котлети",
    "Скумбрія в духовці",
  ],
  salad: [
    "Огірок, помідор і зелень",
    "Молода капуста з кропом",
    "Буряк із фетою",
    "Морква з яблуком",
    "Зелене листя з авокадо",
    "Грецький салат",
    "Рукола з помідорами",
  ],
} as const;
export type MenuSuggestion = { side: string; protein: string; salad: string };
export const firstMenu: MenuSuggestion = {
  side: menuOptions.side[0],
  protein: menuOptions.protein[0],
  salad: menuOptions.salad[0],
};
export function nextMenu(
  previous: MenuSuggestion,
  random = () => {
    const value = new Uint32Array(1);
    crypto.getRandomValues(value);
    return value[0] / 2 ** 32;
  },
): MenuSuggestion {
  const select = (key: keyof MenuSuggestion) => {
    const choices = menuOptions[key].filter((item) => item !== previous[key]);
    return choices[
      Math.min(
        choices.length - 1,
        Math.max(0, Math.floor(random() * choices.length)),
      )
    ];
  };
  return {
    side: select("side"),
    protein: select("protein"),
    salad: select("salad"),
  };
}
