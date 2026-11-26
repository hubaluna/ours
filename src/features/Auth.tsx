import { useState, type FormEvent } from "react";
import { ArrowRight, Check, Eye, EyeOff, KeyRound, Link2, Mail } from "lucide-react";
import { Button, Field } from "../components/ui";
import { TogetherArt } from "../components/Illustrations";
import { useApp } from "../hooks/AppContext";
import { checked, supabase } from "../lib/supabase";
import { errorMessage } from "../lib/utils";

const INVITE_STORAGE_KEY = "ours-invite-v1";
const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

function readSavedInvite(): string {
  try {
    const raw = localStorage.getItem(INVITE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { token?: string; savedAt?: number };
      if (
        parsed?.token &&
        typeof parsed.savedAt === "number" &&
        Date.now() - parsed.savedAt < INVITE_TTL_MS
      ) {
        return parsed.token;
      }
      localStorage.removeItem(INVITE_STORAGE_KEY);
    }
  } catch {
    // ignore storage read error
  }
  try {
    return sessionStorage.getItem("ours-invite") ?? "";
  } catch {
    return "";
  }
}

function clearSavedInvite(): void {
  try {
    localStorage.removeItem(INVITE_STORAGE_KEY);
  } catch {
    // ignore
  }
  try {
    sessionStorage.removeItem("ours-invite");
  } catch {
    // ignore
  }
}

export function Auth() {
  const [signup, setSignup] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [resetInfo, setResetInfo] = useState(""),
    [emailValue, setEmailValue] = useState(""),
    [showPassword, setShowPassword] = useState(false),
    [sent, setSent] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setResetInfo("");
    const f = new FormData(e.currentTarget),
      email = String(f.get("email")),
      password = String(f.get("password"));
    try {
      if (signup) {
        const { data, error } = await supabase!.auth.signUp({
          email,
          password,
          options: {
            data: { name: String(f.get("name")).trim() },
            emailRedirectTo: location.origin + import.meta.env.BASE_URL,
          },
        });
        if (error) throw error;
        if (!data.session) setSent(true);
      } else {
        const { error } = await supabase!.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const handleResetPassword = async () => {
    const cleanEmail = emailValue.trim();
    if (!cleanEmail) {
      setError("Спочатку введіть електронну пошту вище.");
      return;
    }
    if (!supabase || busy) return;
    setBusy(true);
    setError("");
    setResetInfo("");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: location.origin + import.meta.env.BASE_URL,
      });
      if (error) throw error;
      setResetInfo("Лист для відновлення пароля надіслано на пошту.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="auth-shell">
      <a className="brand" href={import.meta.env.BASE_URL}>
        ours<span>.</span>
      </a>
      <div className="auth-grid">
        <div className="auth-welcome">
          <span className="eyebrow">ВАШ ПРИВАТНИЙ ПРОСТІР ДЛЯ ДВОХ</span>
          <h1>
            Маленькі речі.
            <br />
            Велике <em>разом.</em>
          </h1>
          <p>
            Покупки, бажання та спільні плани.
            <br />
            Усе, що робить ваше життя трохи простішим.
          </p>
          <TogetherArt />
        </div>
        <div className="auth-card card">
          {sent ? (
            <div className="email-sent">
              <Mail size={30} />
              <h2>Зазирніть у пошту</h2>
              <p>
                Підтвердіть адресу за посиланням у листі. Потім поверніться сюди
                та увійдіть.
              </p>
              <Button
                onClick={() => {
                  setSent(false);
                  setSignup(false);
                }}
              >
                Перейти до входу
              </Button>
            </div>
          ) : (
            <>
              <h2>{signup ? "Почнемо вашу історію" : "З поверненням"}</h2>
              <p>
                {signup
                  ? "Власний акаунт. Один спільний світ."
                  : "Ваш маленький світ чекає."}
              </p>
              <form className="form" onSubmit={submit}>
                {signup && (
                  <Field label="Ваше ім’я">
                    <input
                      name="name"
                      autoComplete="given-name"
                      required
                      maxLength={60}
                      placeholder="Як до вас звертатися?"
                    />
                  </Field>
                )}
                <Field label="Електронна пошта">
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={emailValue}
                    onChange={(e) => setEmailValue(e.target.value)}
                    placeholder="you@example.com"
                  />
                </Field>
                <Field label="Пароль">
                  <div className="password-input-wrap">
                    <input
                      name="password"
                      type={showPassword ? "text" : "password"}
                      minLength={signup ? 10 : undefined}
                      autoComplete={signup ? "new-password" : "current-password"}
                      required
                      placeholder={
                        signup ? "Щонайменше 10 символів" : "Введіть пароль"
                      }
                    />
                    <button
                      type="button"
                      className="password-toggle-btn"
                      aria-label={
                        showPassword ? "Сховати пароль" : "Показати пароль"
                      }
                      onClick={() => setShowPassword((v) => !v)}
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </Field>
                {!signup && (
                  <button
                    type="button"
                    className="text-button auth-forgot-btn"
                    onClick={() => void handleResetPassword()}
                  >
                    Забули пароль?
                  </button>
                )}
                {resetInfo && (
                  <p className="auth-reset-info" role="status">
                    {resetInfo}
                  </p>
                )}
                {error && (
                  <p className="form-error" role="alert">
                    {error}
                  </p>
                )}
                <Button type="submit" busy={busy}>
                  {signup ? "Створити акаунт" : "Увійти"}
                  <ArrowRight size={18} />
                </Button>
              </form>
              <button
                className="text-button auth-toggle"
                onClick={() => {
                  setSignup(!signup);
                  setError("");
                }}
              >
                {signup
                  ? "Уже маєте акаунт? Увійти"
                  : "Уперше тут? Створити акаунт"}
              </button>
              <p className="auth-privacy">
                <KeyRound size={13} />
                Тільки ви двоє. Без зайвих очей.
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
export function PairSetup() {
  const { refresh, run, pending, data, userId } = useApp();
  const [token, setToken] = useState(() => readSavedInvite());
  const hasInvite = Boolean(token.trim());
  const join = () =>
    run(
      "join",
      async () => {
        const value = token.includes("#invite=")
          ? token.split("#invite=")[1]
          : token.trim();
        await checked(supabase!.rpc("join_couple", { p_token: value }));
        clearSavedInvite();
        await refresh();
      },
      "Тепер ви разом",
    );
  const createCard = (
    <div className="card pair-card" key="create-space">
      <h2>Створити наш простір</h2>
      <p>
        Перший крок — за вами. Далі надішліть партнеру приватне запрошення.
      </p>
      <Button
        className={hasInvite ? "secondary" : undefined}
        busy={pending.includes("create-couple")}
        onClick={() =>
          void run(
            "create-couple",
            async () => {
              await checked(supabase!.rpc("create_couple"));
              clearSavedInvite();
              await refresh();
            },
            "Ваш простір створено",
          )
        }
      >
        <Check size={18} />
        Створити простір
      </Button>
    </div>
  );
  const joinCard = (
    <div className="card pair-card" key="join-space">
      <h2>Уже маєте запрошення?</h2>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void join();
        }}
      >
        <Field label="Посилання або код запрошення">
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
            placeholder="Вставте запрошення партнера"
            autoComplete="off"
          />
        </Field>
        <Button
          className={hasInvite ? undefined : "secondary"}
          busy={pending.includes("join")}
          type="submit"
        >
          <Link2 size={18} />
          Приєднатися
        </Button>
      </form>
    </div>
  );
  return (
    <main className="pair-shell">
      <div className="brand">
        ours<span>.</span>
      </div>
      <TogetherArt />
      <h1>
        Привіт, {data.profiles.find((p) => p.id === userId)?.name ?? "друже"}.
      </h1>
      <p>У вашому маленькому світі є місце для двох.</p>
      {hasInvite ? [joinCard, createCard] : [createCard, joinCard]}
      <button
        className="text-button"
        onClick={() => void supabase?.auth.signOut()}
      >
        Вийти
      </button>
    </main>
  );
}
