import { useState, type FormEvent } from "react";
import { ArrowRight, Check, KeyRound, Link2, Mail } from "lucide-react";
import { Button, Field } from "../components/ui";
import { TogetherArt } from "../components/Illustrations";
import { useApp } from "../hooks/AppContext";
import { checked, supabase } from "../lib/supabase";
import { errorMessage } from "../lib/utils";
export function Auth() {
  const [signup, setSignup] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [sent, setSent] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
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
                    placeholder="you@example.com"
                  />
                </Field>
                <Field label="Пароль">
                  <input
                    name="password"
                    type="password"
                    minLength={10}
                    autoComplete={signup ? "new-password" : "current-password"}
                    required
                    placeholder="Щонайменше 10 символів"
                  />
                </Field>
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
  const [token, setToken] = useState(
    () => sessionStorage.getItem("ours-invite") ?? "",
  );
  const join = () =>
    run(
      "join",
      async () => {
        const value = token.includes("#invite=")
          ? token.split("#invite=")[1]
          : token.trim();
        await checked(supabase!.rpc("join_couple", { p_token: value }));
        sessionStorage.removeItem("ours-invite");
        await refresh();
      },
      "Тепер ви разом",
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
      <div className="card pair-card">
        <h2>Створити наш простір</h2>
        <p>
          Перший крок — за вами. Далі надішліть партнеру приватне запрошення.
        </p>
        <Button
          busy={pending.includes("create-couple")}
          onClick={() =>
            void run(
              "create-couple",
              async () => {
                await checked(supabase!.rpc("create_couple"));
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
      <div className="card pair-card">
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
            className="secondary"
            busy={pending.includes("join")}
            type="submit"
          >
            <Link2 size={18} />
            Приєднатися
          </Button>
        </form>
      </div>
      <button
        className="text-button"
        onClick={() => void supabase?.auth.signOut()}
      >
        Вийти
      </button>
    </main>
  );
}
