import { useRef, useState, type FormEvent } from "react";
import {
  Camera,
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
