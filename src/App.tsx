import { lazy, Suspense, useState, useEffect } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import {
  CalendarDays,
  Gift,
  House,
  Plus,
  ShoppingBag,
  WifiOff,
  RefreshCw,
  X,
} from "lucide-react";
import { useApp } from "./hooks/AppContext";
import { useTheme } from "./hooks/useTheme";
import { Auth, PairSetup } from "./features/Auth";
import { Avatar, Button, Skeleton, Toast } from "./components/ui";
import { ShoppingForm, EventForm } from "./components/Forms";
import { spring, enter } from "./lib/motion";
import type { Plan, Tab } from "./lib/types";
import { useRegisterSW } from "virtual:pwa-register/react";
const Home = lazy(() => import("./features/Home")),
  Shopping = lazy(() => import("./features/Shopping")),
  Wishes = lazy(() => import("./features/Wishes")),
  Plans = lazy(() => import("./features/Plans")),
  Settings = lazy(() => import("./features/Settings"));
const tabs = [
  { id: "home", label: "Головна", icon: House },
  { id: "shopping", label: "Покупки", icon: ShoppingBag },
  { id: "wishes", label: "Бажання", icon: Gift },
  { id: "plans", label: "Плани", icon: CalendarDays },
] as const;
export default function App() {
  const {
    demo,
    authReady,
    session,
    coupleId,
    loading,
    failure,
    data,
    userId,
    online,
    sync,
    refresh,
  } = useApp();
  const { theme, setTheme } = useTheme();
  const [tab, setTab] = useState<Tab>("home"),
    [settings, setSettings] = useState(false),
    [quickAdd, setQuickAdd] = useState(false),
    [event, setEvent] = useState<Plan | null>(null);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  useEffect(() => {
    setSettings(false);
    setQuickAdd(false);
    setEvent(null);
    setTab("home");
  }, [userId]);
  const me = data.profiles.find((p) => p.id === userId);
  return (
    <MotionConfig reducedMotion="user">
      <Toast />
      {!authReady ? (
        <div className="app-shell">
          <Skeleton />
        </div>
      ) : !demo && !session ? (
        <Auth />
      ) : !demo && !coupleId && !loading ? (
        failure ? (
          <main className="pair-shell">
            <h1>Повернемо ваш простір</h1>
            <p>
              Не вдалося завантажити дані. Перевірте інтернет або налаштування
              Supabase.
            </p>
            <Button onClick={() => void refresh()}>Спробувати ще раз</Button>
          </main>
        ) : (
          <PairSetup />
        )
      ) : (
        <div className="app-shell">
          <header className="app-header">
            <button
              className="brand"
              onClick={() => setTab("home")}
              aria-label="ours. — головна"
            >
              ours<span>.</span>
            </button>
            <div className="header-right">
              {demo ? (
                <span className="demo-badge">
                  ДЕМО <i /> лише на цьому пристрої
                </span>
              ) : (
                <span
                  className={`sync-badge ${online && sync === "live" && !failure ? "" : "muted"}`}
                >
                  <i />
                  {!online
                    ? "Без з’єднання"
                    : failure
                      ? "Дані не оновлено"
                      : sync === "live"
                        ? "Ваш приватний простір"
                        : "Відновлюємо зв’язок"}
                </span>
              )}
              <button
                className="avatar-button"
                onClick={() => setSettings(true)}
                aria-label="Відкрити налаштування"
              >
                <Avatar name={me?.name ?? "Я"} path={me?.avatar_path} />
              </button>
            </div>
          </header>
          {(!online || failure || (!demo && sync !== "live")) && (
            <div className="connection-banner" role="status">
              <WifiOff size={15} />
              <span>
                {!online
                  ? "Без інтернету. Зміни тимчасово недоступні."
                  : failure
                    ? "Дані можуть бути застарілими."
                    : "Очікуємо живе з’єднання. Зміни оновлюються після збереження."}
              </span>
              {online && (
                <button
                  aria-label="Оновити дані"
                  onClick={() => void refresh()}
                >
                  <RefreshCw size={16} />
                </button>
              )}
            </div>
          )}
          <main id="main-content">
            {loading ? (
              <Skeleton />
            ) : (
              <Suspense fallback={<Skeleton />}>
                <AnimatePresence mode="wait">
                  <motion.div key={tab} {...enter}>
                    {tab === "home" ? (
                      <Home
                        navigate={setTab}
                        onAdd={() => setQuickAdd(true)}
                        onEvent={(id) =>
                          setEvent(data.events.find((e) => e.id === id) ?? null)
                        }
                      />
                    ) : tab === "shopping" ? (
                      <Shopping />
                    ) : tab === "wishes" ? (
                      <Wishes />
                    ) : (
                      <Plans />
                    )}
                  </motion.div>
                </AnimatePresence>
              </Suspense>
            )}
          </main>
          <nav className="bottom-nav glass" aria-label="Основна навігація">
            {tabs.map(({ id, label, icon: Icon }) => (
              <motion.button
                whileTap={{ scale: 0.97 }}
                key={id}
                aria-current={tab === id ? "page" : undefined}
                onClick={() => setTab(id)}
                className={tab === id ? "active" : ""}
              >
                {tab === id && (
                  <motion.span
                    layoutId="navigation-active"
                    className="navigation-active"
                    transition={spring}
                  />
                )}
                <span className="nav-content">
                  <Icon size={21} strokeWidth={tab === id ? 2 : 1.7} />
                  <span>{label}</span>
                </span>
              </motion.button>
            ))}
          </nav>
          <AnimatePresence>
            {settings && (
              <Suspense fallback={null}>
                <Settings
                  onClose={() => setSettings(false)}
                  theme={theme}
                  setTheme={setTheme}
                />
              </Suspense>
            )}
            {quickAdd && <ShoppingForm onClose={() => setQuickAdd(false)} />}
            {event && (
              <EventForm event={event} onClose={() => setEvent(null)} />
            )}
          </AnimatePresence>
          {needRefresh && !settings && !quickAdd && !event && (
            <div className="update-banner glass">
              <span>Є свіжа версія ours.</span>
              <Button
                className="ghost"
                onClick={() => void updateServiceWorker(true)}
              >
                Оновити <Plus size={14} />
              </Button>
              <button
                aria-label="Оновити пізніше"
                onClick={() => setNeedRefresh(false)}
              >
                <X size={16} />
              </button>
            </div>
          )}
        </div>
      )}
    </MotionConfig>
  );
}
