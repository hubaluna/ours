import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Camera,
  Bell,
  Check,
  Copy,
  Download,
  LogOut,
  Monitor,
  Moon,
  Smartphone,
  Sun,
  UsersRound,
} from "lucide-react";
import { useApp } from "../hooks/AppContext";
import { checked, supabase, uploadImage } from "../lib/supabase";
import { downloadJson } from "../lib/utils";
import type { Theme } from "../lib/types";
import { Avatar, BottomSheet, Button, Field } from "../components/ui";
import {
  pushSupportMessage,
  savePushPreferences,
  savePushSubscription,
  subscribeToPush,
} from "../lib/push-notifications";
export default function Settings({
  onClose,
  theme,
  setTheme,
}: {
  onClose: () => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
}) {
  const { data, userId, coupleId, demo, pending, saveProfile, run, notify } =
    useApp();
  const me = data.profiles.find((p) => p.id === userId),
    partner = data.profiles.find((p) => p.id !== userId);
  const [name, setName] = useState(me?.name ?? ""),
    [avatar, setAvatar] = useState(me?.avatar_path ?? null),
    [uploading, setUploading] = useState(false),
    [invite, setInvite] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await saveProfile(name.trim(), avatar)) onClose();
  };
  return (
    <BottomSheet title="Ваш простір" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="sheet-actions form-save">
          <Button type="submit" busy={uploading || pending.includes("profile")}>
            Зберегти профіль
          </Button>
        </div>
        <div className="profile-edit">
          <Avatar name={name || "Я"} path={avatar} size="large" />
          <Button
            type="button"
            className="ghost"
            busy={uploading}
            onClick={() => file.current?.click()}
          >
            <Camera size={17} />
            Змінити фото
          </Button>
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
        </div>
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
      </form>
      <section className="settings-section">
        <h3>Трохи настрою</h3>
        <div className="theme-options">
          {(
            [
              { id: "light", label: "Світла", Icon: Sun },
              { id: "dark", label: "Темна", Icon: Moon },
              { id: "system", label: "Як у системі", Icon: Monitor },
            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              className={theme === id ? "active" : ""}
              onClick={() => setTheme(id)}
              aria-pressed={theme === id}
            >
              <Icon size={21} />
              <span>{label}</span>
              {theme === id && <Check size={13} />}
            </button>
          ))}
        </div>
      </section>
      <PushSettings userId={userId} coupleId={coupleId} demo={demo} notify={notify} />
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
                <p>Разом у цьому просторі</p>
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
        <h3>Ваші дані</h3>
        <Button
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
            });
            notify("Експорт підготовлено");
          }}
        >
          <Download size={18} />
          <span>Експортувати у JSON</span>
        </Button>
        <div className="install-note">
          <Smartphone size={19} />
          <p>На iPhone: Safari → «Поширити» → «На початковий екран».</p>
        </div>
        {demo ? (
          <p className="subtle-note">
            Деморежим. Дані зберігаються тільки в цьому браузері.
          </p>
        ) : (
          <Button
            className="danger ghost settings-row"
            onClick={() => void supabase?.auth.signOut()}
          >
            <LogOut size={18} />
            Вийти з акаунта
          </Button>
        )}
      </section>
      <p className="settings-signature">
        ours. <span>маленькі речі, велике разом</span>
      </p>
    </BottomSheet>
  );
}

type PushPrefs = { enabled: boolean; shopping: boolean; wishes: boolean; movies: boolean; events: boolean; recipes: boolean };
const defaultPushPrefs: PushPrefs = { enabled: false, shopping: true, wishes: true, movies: true, events: true, recipes: true };
function PushSettings({ userId, coupleId, demo, notify }: { userId: string; coupleId: string | null; demo: boolean; notify: (text: string) => void }) {
  const [preferences, setPreferences] = useState(defaultPushPrefs);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!supabase || demo || !userId) return;
    let alive = true;
    void (async () => {
      try {
        const row = await checked(supabase.from("push_preferences").select("*").eq("user_id", userId).maybeSingle());
        if (alive && row) setPreferences({ ...defaultPushPrefs, ...row });
      } catch {
        if (alive) notify("Не вдалося завантажити налаштування сповіщень.");
      }
    })();
    return () => { alive = false; };
  }, [demo, userId, notify]);

  const toggle = async () => {
    if (demo || !coupleId) {
      notify("Сповіщення доступні після підключення акаунта.");
      return;
    }
    setBusy(true);
    try {
      if (preferences.enabled) {
        const next = { ...preferences, enabled: false };
        await savePushPreferences(userId, next);
        setPreferences(next);
        notify("Push-сповіщення вимкнено для акаунта.");
      } else {
        const subscription = await subscribeToPush();
        await savePushSubscription(subscription, userId, coupleId);
        const next = { ...preferences, enabled: true };
        await savePushPreferences(userId, next);
        setPreferences(next);
        notify("Push-сповіщення увімкнено на цьому пристрої.");
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не вдалося змінити сповіщення.");
    } finally {
      setBusy(false);
    }
  };
  const updateKind = (key: keyof Omit<PushPrefs, "enabled">, value: boolean) => {
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    if (!demo && userId) void savePushPreferences(userId, next).catch(() => notify("Не вдалося зберегти типи сповіщень."));
  };
  const supportMessage = typeof window === "undefined" ? null : pushSupportMessage();
  return (
    <section className="settings-section push-settings">
      <h3><Bell size={16} /> Сповіщення</h3>
      <p className="settings-help">Push на телефон про зміни партнера, навіть коли Ours закритий. На iPhone застосунок має бути доданий на екран «Додому».</p>
      {demo ? <p className="settings-help">Підключіть акаунт і спільний простір, щоб увімкнути push.</p> : supportMessage ? <p className="settings-help">{supportMessage}</p> : null}
      {typeof window !== "undefined" && "Notification" in window && Notification.permission === "denied" && <p className="settings-help">Доступ заборонено в браузері. Змініть дозвіл у налаштуваннях сайту на телефоні.</p>}
      <Button className={preferences.enabled ? "secondary" : "ghost"} busy={busy} onClick={() => void toggle()}>
        {preferences.enabled ? "Вимкнути push" : "Увімкнути push на цьому пристрої"}
      </Button>
      {preferences.enabled && <div className="push-kind-list">
        {([
          ["shopping", "Покупки"], ["wishes", "Бажання"], ["movies", "Кіно"], ["events", "Календар"], ["recipes", "Меню"],
        ] as const).map(([key, label]) => <label key={key}>
          <input type="checkbox" checked={preferences[key]} onChange={(event) => updateKind(key, event.target.checked)} />
          <span>{label}</span>
        </label>)}
      </div>}
    </section>
  );
}
