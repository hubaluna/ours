export const kyivDate = (date = new Date()) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
export const money = (value: number) =>
  new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: "UAH",
    maximumFractionDigits: 0,
  }).format(value);
export const longDate = (date: string) =>
  new Intl.DateTimeFormat("uk-UA", {
    day: "numeric",
    month: "long",
    weekday: "long",
    timeZone: "Europe/Kyiv",
  }).format(new Date(`${date}T12:00:00+02:00`));
export const greeting = () => {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "Europe/Kyiv",
    }).format(new Date()),
  );
  return hour < 5
    ? "Тихої ночі"
    : hour < 12
      ? "Доброго ранку"
      : hour < 18
        ? "Доброго дня"
        : "Доброго вечора";
};
export const safeUrl = (value: string) => {
  try {
    const u = new URL(value);
    return ["https:", "http:"].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
};
export function downloadJson(data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `ours-${kyivDate()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function errorMessage(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : (error as { message?: string })?.message || "";
  if (/invite|invitation/i.test(message))
    return "Запрошення вже використане, прострочене або простір заповнений.";
  if (/Invalid login/i.test(message)) return "Перевірте пошту та пароль.";
  if (/Email not confirmed/i.test(message))
    return "Підтвердіть пошту за посиланням у листі.";
  if (/already.*member|already.*space/i.test(message))
    return "Ви вже маєте спільний простір.";
  return navigator.onLine
    ? "Не вдалося зберегти зміни. Спробуйте ще раз."
    : "Немає з’єднання. Введені дані збережено у формі.";
}

export const isUpcoming = (event: {
  date: string;
  time: string | null;
  all_day: boolean;
}) => {
  const today = kyivDate();
  if (event.date !== today) return event.date > today;
  if (event.all_day || !event.time) return true;
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Kyiv",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
  return event.time.slice(0, 5) >= time;
};
