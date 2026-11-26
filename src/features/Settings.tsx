import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  Camera,
  Bell,
  Check,
  ChevronRight,
  Copy,
  Download,
  LogOut,
  Monitor,
  Moon,
  RefreshCw,
  RotateCcw,
  Share2,
  Smartphone,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  UsersRound,
  X,
} from "lucide-react";
import { useApp } from "../hooks/AppContext";
import { clearImageCache } from "../hooks/useImage";
import { checked, supabase, uploadImage } from "../lib/supabase";
import { downloadJson, formatLastSeen } from "../lib/utils";
import { forceAppUpdate, hardReloadApp } from "../lib/pwa-update";
import { DARK_PALETTES, LIGHT_PALETTES } from "../hooks/useTheme";
import type { DarkPalette, LightPalette, Theme } from "../lib/types";
import {
  Avatar,
  BottomSheet,
  Button,
  Field,
  IconButton,
} from "../components/ui";
import {
  getDevicePushState,
  pushSupportMessage,
  savePushPreferences,
  savePushSubscription,
  sendTestServerPush,
  subscribeToPush,
  unsubscribeDevicePush,
  type DevicePushState,
} from "../lib/push-notifications";
import {
  enableReminderNotifications,
  getReminderPushEnabled,
  isReminderNotificationSupported,
  sendTestReminderNotification,
  setReminderPushEnabled,
} from "../lib/reminder-notifications";
import {
  getMascotLevel,
  isCatMuted,
  MASCOT_LEVEL_DESCRIPTIONS,
  setCatMuted,
  setMascotLevel,
  type MascotLevel,
} from "../lib/cat-sound";
export default function Settings({
  onClose,
  theme,
  setTheme,
  resolvedTheme,
  lightPalette,
  setLightPalette,
  darkPalette,
  setDarkPalette,
  updateServiceWorker,
}: {
  onClose: () => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: "light" | "dark";
  lightPalette: LightPalette;
  setLightPalette: (palette: LightPalette) => void;
  darkPalette: DarkPalette;
  setDarkPalette: (palette: DarkPalette) => void;
  updateServiceWorker?: (reloadPage?: boolean) => Promise<void>;
}) {
  const {
    data,
    session,
    userId,
    coupleId,
    coupleCreatedBy,
    demo,
    pending,
    saveProfile,
    refresh,
    run,
    notify,
    trash,
    restoreFromTrash,
    deleteTrashEntry,
    emptyTrash,
    importBackupJson,
  } = useApp();
  const me = data.profiles.find((p) => p.id === userId),
    partner = data.profiles.find((p) => p.id !== userId);
  const canSeePartnerLastSeen =
    !demo && Boolean(coupleCreatedBy && coupleCreatedBy === userId);
  const partnerLastSeen = canSeePartnerLastSeen
    ? formatLastSeen(partner?.updated_at)
    : null;
  useEffect(() => {
    if (canSeePartnerLastSeen && navigator.onLine) {
      void refresh();
    }
  }, [canSeePartnerLastSeen, refresh]);
  const [name, setName] = useState(me?.name ?? ""),
    [avatar, setAvatar] = useState(me?.avatar_path ?? null),
    [uploading, setUploading] = useState(false),
    [signingOut, setSigningOut] = useState(false),
    [invite, setInvite] = useState(""),
    [showTrash, setShowTrash] = useState(false),
    [catSoundEnabled, setCatSoundEnabled] = useState(() => !isCatMuted()),
    [mascotLevel, setMascotLevelState] = useState<MascotLevel>(() =>
      getMascotLevel(),
    ),
    [checkingUpdate, setCheckingUpdate] = useState(false),
    [backupPreview, setBackupPreview] = useState<{
      fileName: string;
      payload: Record<string, unknown>;
      summary: string;
    } | null>(null);
  const backupInput = useRef<HTMLInputElement>(null);

  const handleCheckUpdate = async () => {
    if (checkingUpdate) return;
    setCheckingUpdate(true);
    try {
      notify("Перевіряємо наявність оновлень на сервері...");
      const res = await forceAppUpdate({ updateServiceWorker });
      if (res === "reloading") {
        notify("Оновлення знайдено! Перезавантажуємо...");
      } else if (res === "offline") {
        notify("Немає підключення до мережі.");
      } else if (res === "unsupported") {
        notify("Оновлення не підтримується цим браузером.");
      } else {
        notify(
          "Встановлено останню версію. Якщо оновлення щойно вийшло — спробуйте через 1–2 хв.",
        );
      }
    } catch {
      notify("Не вдалося перевірити оновлення.");
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleHardReload = async () => {
    notify("Очищаємо кеш і перезавантажуємо...");
    await hardReloadApp({ updateServiceWorker });
  };
  const file = useRef<HTMLInputElement>(null);
  const profileDirty =
    name.trim() !== (me?.name ?? "").trim() ||
    avatar !== (me?.avatar_path ?? null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await saveProfile(name.trim(), avatar)) onClose();
  };
  const handleSignOut = async () => {
    if (signingOut || !supabase) return;
    setSigningOut(true);
    try {
      await clearImageCache();
      const { error } = await supabase.auth.signOut();
      if (error) {
        await supabase.auth.signOut({ scope: "local" });
      }
      onClose();
    } catch {
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        /* ignore */
      }
      onClose();
    } finally {
      setSigningOut(false);
    }
  };
  if (showTrash) {
    return (
      <BottomSheet title="Кошик" onClose={onClose} guardChanges={false}>
        <div className="trash-panel">
          <div className="trash-toolbar">
            <Button
              type="button"
              className="ghost"
              onClick={() => setShowTrash(false)}
            >
              <ArrowLeft size={16} />
              Назад до налаштувань
            </Button>
            {trash.length > 0 && (
              <Button
                type="button"
                className="danger ghost"
                onClick={() => emptyTrash()}
              >
                Очистити
              </Button>
            )}
          </div>
          {trash.length === 0 ? (
            <p className="settings-help trash-empty">
              Кошик порожній. Видалені покупки, бажання, події, фільми, рецепти
              та рослини зберігаються тут 14 днів.
            </p>
          ) : (
            <div className="trash-list">
              {trash.map((entry) => (
                <div className="trash-row" key={entry.id}>
                  <div className="trash-copy">
                    <small>
                      {entry.kindLabel} ·{" "}
                      {new Intl.DateTimeFormat("uk-UA", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "Europe/Kyiv",
                      }).format(new Date(entry.deletedAt))}
                    </small>
                    <strong>{entry.label}</strong>
                  </div>
                  <Button
                    type="button"
                    className="secondary"
                    busy={pending.includes(`restore-${entry.id}`)}
                    onClick={() => void restoreFromTrash(entry.id)}
                  >
                    <RotateCcw size={14} />
                    Відновити
                  </Button>
                  <IconButton
                    label={`Видалити назавжди ${entry.label}`}
                    onClick={() => deleteTrashEntry(entry.id)}
                  >
                    <X size={15} />
                  </IconButton>
                </div>
              ))}
            </div>
          )}
        </div>
      </BottomSheet>
    );
  }
  return (
    <BottomSheet
      title="Ваш простір"
      onClose={onClose}
      guardChanges={profileDirty}
    >
      <div className="settings-sheet">
        <form className="form settings-profile-form" onSubmit={submit}>
          <div className="profile-edit profile-edit-row">
            <button
              type="button"
              className={`profile-avatar-trigger${uploading ? " is-busy" : ""}`}
              onClick={() => file.current?.click()}
              disabled={uploading}
              aria-label="Змінити фото профілю"
              title="Змінити фото"
            >
              <Avatar name={name || "Я"} path={avatar} size="large" />
              <span className="profile-avatar-badge" aria-hidden="true">
                <Camera size={12} />
              </span>
            </button>
            <input
              hidden
              ref={file}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={async (e) => {
                const image = e.target.files?.[0];
                if (!image) return;
                setUploading(true);
                try {
                  setAvatar(await uploadImage(image, userId, coupleId!));
                } catch (e) {
                  notify(
                    e instanceof Error
                      ? e.message
                      : "Не вдалося завантажити фото.",
                  );
                } finally {
                  setUploading(false);
                }
              }}
            />
            <Field label="Ваше ім’я">
              <input
                data-autofocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                pattern=".*\S.*"
                maxLength={60}
              />
            </Field>
          </div>
          <Button
            type="submit"
            className="settings-save-btn"
            busy={uploading || pending.includes("profile")}
          >
            Зберегти профіль
          </Button>
        </form>
        {!demo && (
          <div className="settings-account-bar">
            <div className="settings-account-meta">
              <span className="settings-account-label">Акаунт</span>
              {session?.user.email && (
                <strong className="settings-account-email">
                  {session.user.email}
                </strong>
              )}
            </div>
            <Button
              type="button"
              className="danger ghost settings-signout-btn"
              busy={signingOut}
              onClick={() => void handleSignOut()}
            >
              <LogOut size={15} />
              <span>Вийти з акаунта</span>
            </Button>
          </div>
        )}
        <section className="settings-section">
          <h3>Трохи настрою</h3>
          <div className="theme-options">
            {(
              [
                { id: "light", label: "Світла", Icon: Sun },
                { id: "dark", label: "Темна", Icon: Moon },
                { id: "system", label: "Система", Icon: Monitor },
              ] as const
            ).map(({ id, label, Icon }) => (
              <button
                type="button"
                key={id}
                className={theme === id ? "active" : ""}
                onClick={() => setTheme(id)}
                aria-pressed={theme === id}
              >
                <Icon size={19} />
                <span>{label}</span>
                {theme === id && <Check size={12} />}
              </button>
            ))}
          </div>
          <div className="palette-block">
            <span className="palette-caption">
              {resolvedTheme === "dark"
                ? "Відтінок темної теми"
                : "Відтінок світлої теми"}
            </span>
            <div
              className="palette-options"
              role="group"
              aria-label={
                resolvedTheme === "dark"
                  ? "Відтінок темної теми"
                  : "Відтінок світлої теми"
              }
            >
              {resolvedTheme === "dark"
                ? DARK_PALETTES.map((p) => {
                    const active = darkPalette === p.id;
                    return (
                      <button
                        type="button"
                        key={p.id}
                        className={`palette-swatch-btn${active ? " active" : ""}`}
                        onClick={() => setDarkPalette(p.id)}
                        aria-pressed={active}
                      >
                        <span
                          className="palette-swatch-dot"
                          style={{ background: p.swatch }}
                          aria-hidden="true"
                        >
                          {active && <Check size={12} strokeWidth={2.5} />}
                        </span>
                        <span className="palette-swatch-label">{p.label}</span>
                      </button>
                    );
                  })
                : LIGHT_PALETTES.map((p) => {
                    const active = lightPalette === p.id;
                    return (
                      <button
                        type="button"
                        key={p.id}
                        className={`palette-swatch-btn${active ? " active" : ""}`}
                        onClick={() => setLightPalette(p.id)}
                        aria-pressed={active}
                      >
                        <span
                          className="palette-swatch-dot"
                          style={{ background: p.swatch }}
                          aria-hidden="true"
                        >
                          {active && <Check size={12} strokeWidth={2.5} />}
                        </span>
                        <span className="palette-swatch-label">{p.label}</span>
                      </button>
                    );
                  })}
            </div>
          </div>
        </section>
        <section className="settings-section">
          <div className="mascot-slider-card">
            <div className="mascot-slider-header">
              <h3>
                <Sparkles size={15} /> Маскот Луна
              </h3>
              <span className="mascot-slider-badge">
                {MASCOT_LEVEL_DESCRIPTIONS[mascotLevel].label}
              </span>
            </div>
            <div className="mascot-slider-copy">
              <p className="mascot-slider-title">
                <strong>{MASCOT_LEVEL_DESCRIPTIONS[mascotLevel].title}</strong>
              </p>
              <p className="mascot-slider-hint">
                {MASCOT_LEVEL_DESCRIPTIONS[mascotLevel].hint}
              </p>
            </div>
            <div className="mascot-slider-wrap">
              <input
                type="range"
                min="0"
                max="3"
                step="1"
                value={mascotLevel}
                onChange={(e) => {
                  const next = Number(e.target.value) as MascotLevel;
                  setMascotLevelState(next);
                  setMascotLevel(next);
                }}
                aria-label="Рівень активності маскота Луни"
                className="mascot-range-input"
              />
              <div className="mascot-slider-ticks">
                {([0, 1, 2, 3] as const).map((lvl) => (
                  <button
                    type="button"
                    key={lvl}
                    onClick={() => {
                      setMascotLevelState(lvl);
                      setMascotLevel(lvl);
                    }}
                    className={mascotLevel === lvl ? "active" : ""}
                  >
                    {lvl === 0
                      ? "Вимкн."
                      : lvl === 1
                        ? "Рідко"
                        : lvl === 2
                          ? "Базовий"
                          : "Жвавий"}
                  </button>
                ))}
              </div>
            </div>
            {mascotLevel >= 2 && (
              <label className="push-reminder-toggle cat-sound-toggle">
                <input
                  type="checkbox"
                  checked={catSoundEnabled}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setCatMuted(!next);
                    setCatSoundEnabled(next);
                  }}
                />
                <span>
                  <strong>Звуки кішки</strong>
                  <small>Муркотіння та мявкання при погладжуванні</small>
                </span>
              </label>
            )}
          </div>
        </section>
        <PushSettings
          userId={userId}
          coupleId={coupleId}
          demo={demo}
          notify={notify}
        />
      <section className="settings-section">
        <h3>
          <UsersRound size={16} /> Наш маленький світ
        </h3>
        <div className="partner-info">
          {partner ? (
            <>
              <Avatar name={partner.name} path={partner.avatar_path} />
              <div>
                <strong>{partner.name}</strong>
                <p>
                  {partnerLastSeen
                    ? `Останній візит: ${partnerLastSeen}`
                    : "Разом у цьому просторі"}
                </p>
              </div>
              <span className="status-dot" />
            </>
          ) : (
            <p>Ваше місце для партнера ще вільне.</p>
          )}
        </div>
        {!partner && !demo && (
          <>
            <Button
              className="secondary"
              busy={pending.includes("invite")}
              onClick={() =>
                void run(
                  "invite",
                  async () => {
                    const token = await checked(supabase!.rpc("create_invite"));
                    setInvite(
                      `${location.origin}${import.meta.env.BASE_URL}#invite=${token}`,
                    );
                  },
                  "Запрошення готове",
                )
              }
            >
              Створити запрошення
            </Button>
            {invite && (
              <div className="invite-box">
                <Field label="Одноразове запрошення · діє 48 годин">
                  <input
                    value={invite}
                    readOnly
                    onFocus={(e) => e.currentTarget.select()}
                  />
                </Field>
                <Button
                  className="ghost"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(invite);
                      notify("Посилання скопійовано");
                    } catch {
                      notify("Виділіть і скопіюйте посилання з поля.");
                    }
                  }}
                >
                  <Copy size={16} />
                  Копіювати
                </Button>
                <p>
                  Надішліть лише партнеру. Нове запрошення скасовує попереднє.
                </p>
              </div>
            )}
          </>
        )}
      </section>
        <section className="settings-section">
          <h3>
            <RefreshCw size={15} /> Оновлення застосунку
          </h3>
          <p className="settings-help">
            Перевірте свіжу версію або скиньте кеш, якщо щойно оновили проєкт.
          </p>
          <div className="settings-group">
            <Button
              type="button"
              className="settings-row ghost"
              busy={checkingUpdate}
              onClick={() => void handleCheckUpdate()}
            >
              <RefreshCw size={16} />
              <span>Перевірити й оновити</span>
              <ChevronRight size={15} className="settings-row-chevron" />
            </Button>
            <Button
              type="button"
              className="settings-row ghost"
              onClick={() => void handleHardReload()}
            >
              <RotateCcw size={16} />
              <span>Очистити кеш і перезавантажити</span>
              <ChevronRight size={15} className="settings-row-chevron" />
            </Button>
          </div>
        </section>
        <section className="settings-section">
          <h3>Ваші дані</h3>
          <div className="settings-group">
            <Button
              type="button"
              className="settings-row ghost"
              onClick={() => setShowTrash(true)}
            >
              <Trash2 size={16} />
              <span>Кошик · Нещодавно видалене</span>
              {trash.length > 0 ? (
                <span className="count">{trash.length}</span>
              ) : (
                <ChevronRight size={15} className="settings-row-chevron" />
              )}
            </Button>
            <Button
              type="button"
              className="settings-row ghost"
              onClick={() => {
                downloadJson({
                  exported_at: new Date().toISOString(),
                  shopping: data.shopping,
                  shopping_sessions: data.sessions,
                  wishes: data.wishes,
                  events: data.events,
                  movies: data.movies,
                  recipes: data.recipes,
                  meal_plan: data.mealPlan,
                  pantry: data.pantry,
                  plants: data.plants,
                  plant_care: data.plantCare,
                  budget_transactions: data.budgetTransactions,
                  budget_categories: data.budgetCategories,
                  budget_merchant_rules: data.budgetMerchantRules,
                  budget_recurring: data.budgetRecurring,
                });
                notify("Експорт підготовлено");
              }}
            >
              <Download size={16} />
              <span>Експортувати у JSON</span>
              <ChevronRight size={15} className="settings-row-chevron" />
            </Button>
            <Button
              type="button"
              className="settings-row ghost"
              onClick={() => backupInput.current?.click()}
            >
              <Upload size={16} />
              <span>Відновити з JSON</span>
              <ChevronRight size={15} className="settings-row-chevron" />
            </Button>
          </div>
          <input
            hidden
            ref={backupInput}
            type="file"
            accept="application/json,.json"
            onChange={async (e) => {
              const selectedFile = e.target.files?.[0];
              e.target.value = "";
              if (!selectedFile) return;
              try {
                const text = await selectedFile.text();
                const parsed = JSON.parse(text) as Record<string, unknown>;
                if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                  notify("Некоректний формат резервної копії");
                  return;
                }
                const countArr = (...keys: string[]) => {
                  for (const k of keys) {
                    if (Array.isArray(parsed[k])) return (parsed[k] as unknown[]).length;
                  }
                  return 0;
                };
                const parts: string[] = [];
                const addPart = (label: string, n: number) => {
                  if (n > 0) parts.push(`${label}: ${n}`);
                };
                addPart("Покупки", countArr("shopping"));
                addPart("Бажання", countArr("wishes"));
                addPart("Події", countArr("events"));
                addPart("Кіно", countArr("movies"));
                addPart("Рослини", countArr("plants"));
                addPart("єВдома", countArr("pantry"));
                addPart(
                  "Бюджет",
                  countArr("budget_transactions", "budgetTransactions"),
                );
                addPart(
                  "Регулярні",
                  countArr("budget_recurring", "budgetRecurring"),
                );
                if (!parts.length) {
                  notify("У файлі немає записів для відновлення");
                  return;
                }
                setBackupPreview({
                  fileName: selectedFile.name,
                  payload: parsed,
                  summary: parts.join(" · "),
                });
              } catch {
                notify("Не вдалося прочитати JSON-файл");
              }
            }}
          />
          {backupPreview && (
            <div className="backup-restore-preview" role="region" aria-label="Попередній перегляд відновлення">
              <strong>{backupPreview.fileName}</strong>
              <p>{backupPreview.summary}</p>
              <small>
                Нові записи будуть додані без видалення наявних даних.
              </small>
              <div className="backup-restore-actions">
                <Button
                  type="button"
                  busy={pending.includes("import-backup")}
                  onClick={async () => {
                    const res = await importBackupJson(backupPreview.payload);
                    if (res) setBackupPreview(null);
                  }}
                >
                  Відновити дані
                </Button>
                <Button
                  type="button"
                  className="ghost"
                  onClick={() => setBackupPreview(null)}
                >
                  Скасувати
                </Button>
              </div>
            </div>
          )}
          <div className="install-note">
            <Smartphone size={17} />
            <p>На iPhone: Safari → «Поширити» → «На початковий екран».</p>
          </div>
          <ShareSheetSetup notify={notify} />
          {demo && (
            <p className="subtle-note">
              Деморежим. Дані зберігаються тільки в цьому браузері.
            </p>
          )}
        </section>
        <p className="settings-signature">
          ours. <span>маленькі речі, велике разом</span>
        </p>
      </div>
    </BottomSheet>
  );
}

type PushPrefs = {
  enabled: boolean;
  shopping: boolean;
  wishes: boolean;
  movies: boolean;
  events: boolean;
  recipes: boolean;
  budget: boolean;
};
const defaultPushPrefs: PushPrefs = {
  enabled: false,
  shopping: true,
  wishes: true,
  movies: true,
  events: true,
  recipes: true,
  budget: true,
};
function PushSettings({
  userId,
  coupleId,
  demo,
  notify,
}: {
  userId: string;
  coupleId: string | null;
  demo: boolean;
  notify: (text: string) => void;
}) {
  const [preferences, setPreferences] = useState(defaultPushPrefs);
  const [deviceState, setDeviceState] = useState<DevicePushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [remindersEnabled, setRemindersEnabled] = useState(() =>
    getReminderPushEnabled(),
  );
  const [testing, setTesting] = useState(false);
  const [testFeedback, setTestFeedback] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  const refreshDeviceState = async () => {
    if (typeof window === "undefined") return;
    const state = await getDevicePushState(demo ? "" : userId);
    setDeviceState(state);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    let alive = true;
    void (async () => {
      const state = await getDevicePushState(demo ? "" : userId);
      if (alive) setDeviceState(state);
    })();
    if (!supabase || demo || !userId) {
      return () => {
        alive = false;
      };
    }
    void (async () => {
      try {
        const row = await checked(
          supabase
            .from("push_preferences")
            .select("*")
            .eq("user_id", userId)
            .maybeSingle(),
        );
        if (alive && row) setPreferences({ ...defaultPushPrefs, ...row });
      } catch {
        if (alive) notify("Не вдалося завантажити налаштування сповіщень.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [demo, userId, notify]);

  const connectThisDevice = async (forceResubscribe = false) => {
    if (demo || !coupleId) {
      notify("Сповіщення про зміни партнера доступні після входу в акаунт.");
      return;
    }
    setBusy(true);
    try {
      const subscription = await subscribeToPush({ forceResubscribe });
      await savePushSubscription(subscription, userId, coupleId);
      const next = { ...preferences, enabled: true };
      await savePushPreferences(userId, next);
      setPreferences(next);
      setReminderPushEnabled(true);
      setRemindersEnabled(true);
      await refreshDeviceState();
      notify("Push-сповіщення увімкнено на цьому пристрої.");
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Не вдалося увімкнути сповіщення.",
      );
    } finally {
      setBusy(false);
    }
  };

  const toggle = async () => {
    if (demo || !coupleId) {
      notify("Сповіщення про зміни партнера доступні після входу в акаунт.");
      return;
    }
    if (!preferences.enabled) {
      await connectThisDevice(false);
      return;
    }
    setBusy(true);
    try {
      await unsubscribeDevicePush(userId);
      const next = { ...preferences, enabled: false };
      await savePushPreferences(userId, next);
      setPreferences(next);
      await refreshDeviceState();
      notify("Push-сповіщення вимкнено для акаунта.");
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Не вдалося змінити сповіщення.",
      );
    } finally {
      setBusy(false);
    }
  };
  const toggleReminders = async (checkedValue: boolean) => {
    if (!checkedValue) {
      setReminderPushEnabled(false);
      setRemindersEnabled(false);
      notify("Нагадування про полив і події вимкнено.");
      return;
    }
    try {
      await enableReminderNotifications();
      setRemindersEnabled(true);
      notify("Нагадування про рослини та події увімкнено.");
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Не вдалося увімкнути нагадування.",
      );
    }
  };
  const testNotification = async () => {
    setTesting(true);
    setTestFeedback(null);
    try {
      if (!demo && coupleId && !pushSupportMessage()) {
        const result = await sendTestServerPush(userId, coupleId);
        await refreshDeviceState();
        if (result.kind === "server") {
          setRemindersEnabled(true);
          setTestFeedback({ ok: true, text: result.message });
          notify(result.message);
          return;
        }
        if (result.kind === "error") {
          setTestFeedback({ ok: false, text: result.message });
          notify(result.message);
          return;
        }
        // Fallback when server push-dispatch hasn't been redeployed yet:
        await sendTestReminderNotification();
        setRemindersEnabled(true);
        const msg = `Локальне сповіщення працює, але серверний push ще не активний. ${result.message}`;
        setTestFeedback({ ok: false, text: msg });
        notify(msg);
        return;
      }
      await sendTestReminderNotification();
      setRemindersEnabled(true);
      setTestFeedback({ ok: true, text: "Тестове локальне сповіщення надіслано." });
      notify("Тестове сповіщення надіслано.");
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : "Не вдалося надіслати тестове сповіщення.";
      setTestFeedback({ ok: false, text: msg });
      notify(msg);
    } finally {
      setTesting(false);
    }
  };
  const updateKind = (
    key: keyof Omit<PushPrefs, "enabled">,
    value: boolean,
  ) => {
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    if (!demo && userId)
      void savePushPreferences(userId, next).catch(() =>
        notify("Не вдалося зберегти типи сповіщень."),
      );
  };
  const supportMessage =
    typeof window === "undefined" ? null : pushSupportMessage();
  const deviceReady = Boolean(
    deviceState?.hasLocalSubscription &&
      deviceState.vapidMatches &&
      deviceState.savedInDatabase,
  );
  const deviceNeedsConnect = Boolean(
    !demo &&
      coupleId &&
      !supportMessage &&
      preferences.enabled &&
      deviceState &&
      !deviceReady,
  );
  return (
    <section className="settings-section push-settings">
      <h3>
        <Bell size={16} /> Сповіщення
      </h3>
      <p className="settings-help">
        Push приходять з 11:00 до 22:00, а серія покупок збирається без спаму з
        магазину. На iPhone додайте Ours на екран «Додому».
      </p>
      {isReminderNotificationSupported() && (
        <label className="push-reminder-toggle">
          <input
            type="checkbox"
            checked={remindersEnabled}
            onChange={(event) => void toggleReminders(event.target.checked)}
          />
          <span>
            <strong>Нагадування про полив і календар</strong>
            <small>
              Після 11:00: полив — лише в день поливу; календар — за 7 днів, 3
              дні й у день події.
            </small>
          </span>
        </label>
      )}
      {demo ? (
        <p className="settings-help">
          Підключіть акаунт і спільний простір, щоб увімкнути push.
        </p>
      ) : supportMessage ? (
        <p className="settings-help">{supportMessage}</p>
      ) : deviceNeedsConnect ? (
        <p className="settings-help">
          Push увімкнені в акаунті, але цей пристрій ще не підключений (або
          підписка скинулась після оновлення). Натисніть «Підключити цей
          пристрій».
        </p>
      ) : null}
      {typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "denied" && (
          <p className="settings-help">
            Доступ заборонено в браузері. Змініть дозвіл у налаштуваннях сайту
            на телефоні.
          </p>
        )}
      <div className="push-actions">
        {!demo && deviceNeedsConnect && (
          <Button
            className="primary"
            busy={busy}
            onClick={() => void connectThisDevice(true)}
          >
            Підключити цей пристрій
          </Button>
        )}
        {!demo && (
          <Button
            className={preferences.enabled ? "secondary" : "ghost"}
            busy={busy}
            onClick={() => void toggle()}
          >
            {preferences.enabled
              ? "Вимкнути push"
              : "Увімкнути push на цьому пристрої"}
          </Button>
        )}
        {isReminderNotificationSupported() && (
          <Button
            className="ghost push-test-btn"
            busy={testing}
            onClick={() => void testNotification()}
          >
            Перевірити сповіщення
          </Button>
        )}
      </div>
      {testFeedback && (
        <p
          role="status"
          className={`settings-help push-test-feedback${testFeedback.ok ? " is-ok" : " is-warn"}`}
        >
          {testFeedback.text}
        </p>
      )}
      {preferences.enabled && (
        <div className="push-kind-list">
          {(
            [
              ["shopping", "Покупки"],
              ["wishes", "Бажання"],
              ["movies", "Кіно"],
              ["events", "Календар"],
              ["recipes", "Меню"],
              ["budget", "Бюджет"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={preferences[key]}
                onChange={(event) => updateKind(key, event.target.checked)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      )}
    </section>
  );
}

function ShareSheetSetup({ notify }: { notify: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const shareBaseUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${import.meta.env.BASE_URL}?text=`
      : "https://hubaluna.github.io/ours/?text=";

  const copyShareUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareBaseUrl);
      notify("Адресу для меню «Поширити» скопійовано");
    } catch {
      notify("Скопіюйте посилання вручну з поля нижче.");
    }
  };

  return (
    <div className="share-sheet-setup">
      <button
        type="button"
        className="share-sheet-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Share2 size={15} />
        <span>Як додати ours. у меню «Поширити»</span>
        <ChevronRight
          size={15}
          className={`settings-row-chevron${open ? " is-open" : ""}`}
        />
      </button>
      {open && (
        <div className="share-sheet-body">
          <p className="settings-help">
            <strong>На iPhone:</strong> iOS не додає вебзастосунки в меню
            «Поширити» автоматично, але це робиться за 30 секунд через
            «Швидкі команди»:
          </p>
          <ol className="share-sheet-steps">
            <li>
              Відкрийте <strong>Швидкі команди</strong> → <strong>+</strong> →
              назвіть команду <strong>Додати в ours.</strong>
            </li>
            <li>
              Натисніть <strong>ⓘ</strong> внизу й увімкніть{" "}
              <strong>Показати на аркуші поширення</strong> (Приймає: URL-адреси
              та Текст).
            </li>
            <li>
              Додайте дію <strong>Кодувати URL</strong> → виберіть{" "}
              <em>Ввід швидкої команди</em>.
            </li>
            <li>
              Додайте дію <strong>Відкрити URL-адреси</strong> та вставте
              префікс нижче, а одразу після <code>?text=</code> підставте{" "}
              <em>Кодований URL</em>:
            </li>
          </ol>
          <div className="share-sheet-copy-row">
            <input
              readOnly
              value={shareBaseUrl}
              aria-label="Префікс адреси для швидкої команди"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              type="button"
              className="secondary"
              onClick={() => void copyShareUrl()}
            >
              <Copy size={14} />
              Копіювати
            </Button>
          </div>
          <p className="settings-help">
            <strong>На Android:</strong> встановіть ours. через Chrome → меню
            (⋮) → <strong>Встановити додаток</strong> (якщо ставили раніше,
            перевстановіть іконку).
          </p>
        </div>
      )}
    </div>
  );
}
