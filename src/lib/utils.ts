const kyivDateFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Kyiv",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const kyivHourFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "numeric",
  hourCycle: "h23",
  timeZone: "Europe/Kyiv",
});
const moneyFormatter = new Intl.NumberFormat("uk-UA", {
  style: "currency",
  currency: "UAH",
  maximumFractionDigits: 0,
});
const longDateFormatter = new Intl.DateTimeFormat("uk-UA", {
  day: "numeric",
  month: "long",
  weekday: "long",
  timeZone: "Europe/Kyiv",
});
const kyivTimeFormatter = new Intl.DateTimeFormat("uk-UA", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Europe/Kyiv",
});
const shortDateFormatter = new Intl.DateTimeFormat("uk-UA", {
  day: "numeric",
  month: "short",
  timeZone: "Europe/Kyiv",
});

export const kyivDate = (date = new Date()) => kyivDateFormatter.format(date);
export const kyivHour = (date = new Date()) =>
  Number(kyivHourFormatter.format(date));
export const money = (value: number) => moneyFormatter.format(value);
export const longDate = (date: string) =>
  longDateFormatter.format(new Date(`${date}T12:00:00+02:00`));
export function formatLastSeen(
  iso?: string | null,
  now = new Date(),
): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const diffMs = now.getTime() - date.getTime();
  if (diffMs >= 0 && diffMs < 2 * 60 * 1000) {
    return "зараз у застосунку";
  }
  const timeStr = kyivTimeFormatter.format(date);
  const targetDay = kyivDate(date);
  const today = kyivDate(now);
  if (targetDay === today) {
    return `сьогодні о ${timeStr}`;
  }
  const yesterday = kyivDate(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  if (targetDay === yesterday) {
    return `вчора о ${timeStr}`;
  }
  return `${shortDateFormatter.format(date)} о ${timeStr}`;
}
export const greeting = () => {
  const hour = kyivHour();
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
export async function downloadJson(data: unknown) {
  const json = JSON.stringify(data, null, 2);
  const fileName = `ours-${kyivDate()}.json`;
  const blob = new Blob([json], { type: "application/json" });
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      const file = new File([blob], fileName, { type: "application/json" });
      if (!navigator.canShare || navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: fileName });
        return;
      }
    } catch (error) {
      if ((error as { name?: string })?.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
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
  if (/User already registered|already been registered/i.test(message))
    return "Акаунт із цією поштою вже існує. Спробуйте увійти.";
  if (/Password should be/i.test(message))
    return "Пароль має містити щонайменше 10 символів.";
  if (/rate limit|too many requests|for security purposes/i.test(message))
    return "Забагато спроб. Зачекайте хвилину й спробуйте знову.";
  if (/already.*member|already.*space/i.test(message))
    return "Ви вже маєте спільний простір.";
  return navigator.onLine
    ? "Не вдалося зберегти зміни. Спробуйте ще раз."
    : "Немає з’єднання. Введені дані збережено у формі.";
}
