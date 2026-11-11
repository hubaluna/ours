import { lazy, Suspense, useEffect, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import {
  CalendarDays,
  Utensils,
  Film,
  Gift,
  House,
  RefreshCw,
  ShoppingBag,
  WifiOff,
  X,
} from "lucide-react";
import { useApp } from "./hooks/AppContext";
import { useTheme } from "./hooks/useTheme";
import { Auth, PairSetup } from "./features/Auth";
import { Avatar, Button, Skeleton, Toast } from "./components/ui";
import { spring, enter } from "./lib/motion";
import type { Tab } from "./lib/types";
import { useRegisterSW } from "virtual:pwa-register/react";
const screens = {
  home: () => import("./features/Home"),
  shopping: () => import("./features/Shopping"),
  menu: () => import("./features/Menu"),
  movies: () => import("./features/Movies"),
  wishes: () => import("./features/Wishes"),
  plans: () => import("./features/Plans"),
};
const Home = lazy(screens.home),
  Shopping = lazy(screens.shopping),
  Menu = lazy(screens.menu),
  Movies = lazy(screens.movies),
  Wishes = lazy(screens.wishes),
  Plans = lazy(screens.plans),
  Settings = lazy(() => import("./features/Settings"));
const tabs = [
  { id: "home", label: "Головна", icon: House },
  { id: "shopping", label: "Покупки", icon: ShoppingBag },
  { id: "menu", label: "Меню", icon: Utensils },
  { id: "movies", label: "Кіно", icon: Film },
  { id: "wishes", label: "Бажання", icon: Gift },
  { id: "plans", label: "Календар", icon: CalendarDays },
] as const;
type MascotPose = "logo" | "nav" | null;
function useOccasionalCat(): MascotPose {
  const [pose, setPose] = useState<MascotPose>(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let moments = 0,
      showTimer: number | undefined,
      hideTimer: number | undefined;
    const isBusy = () =>
      document.visibilityState !== "visible" ||
      Boolean(document.querySelector('[role="dialog"], [aria-modal="true"]')) ||
      Boolean(
        document.activeElement?.matches(
          "input, textarea, select, [contenteditable='true']",
        ),
      );
    const schedule = () => {
      showTimer = window.setTimeout(() => {
        if (isBusy()) {
          moments++;
          schedule();
          return;
        }
        setPose(moments % 2 === 0 ? "logo" : "nav");
        hideTimer = window.setTimeout(() => {
          setPose(null);
          moments++;
          schedule();
        }, 10000);
      }, moments === 0 ? 25000 : 40000);
    };
    const pause = () => {
      if (isBusy()) setPose(null);
    };
    document.addEventListener("focusin", pause);
    document.addEventListener("visibilitychange", pause);
    const observer = new MutationObserver(pause);
    observer.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ["role", "aria-modal"],
    });
    schedule();
    return () => {
      if (showTimer) window.clearTimeout(showTimer);
      if (hideTimer) window.clearTimeout(hideTimer);
      document.removeEventListener("focusin", pause);
      document.removeEventListener("visibilitychange", pause);
      observer.disconnect();
    };
  }, []);
  return pose;
}
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
  const mascot = useOccasionalCat();
  const [tab, setTab] = useState<Tab>("home"),
    [settings, setSettings] = useState(false);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  useEffect(() => {
    setSettings(false);
    setTab("home");
  }, [userId]);
  useEffect(() => {
    if (!demo && !coupleId) return;
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean } }
    ).connection;
    if (connection?.saveData) return;
    const timer = setTimeout(() => {
      void Promise.allSettled(Object.values(screens).map((load) => load()));
    }, 1200);
    return () => clearTimeout(timer);
  }, [demo, coupleId]);
  useEffect(() => {
    document.body.classList.toggle(
      "app-mode",
      demo || Boolean(session && coupleId),
    );
    return () => document.body.classList.remove("app-mode");
  }, [demo, session, coupleId]);
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
              Не вдалося завантажити дані. Перевірте з’єднання й налаштування
              простору.
            </p>
            <Button onClick={() => void refresh()}>Спробувати ще раз</Button>
          </main>
        ) : (
          <PairSetup />
        )
      ) : (
        <div className="app-shell">
          <AnimatePresence>
            {mascot && (
              <motion.img
                key={mascot}
                className={`app-mascot app-mascot-${mascot}`}
                src={`${import.meta.env.BASE_URL}art/${mascot === "logo" ? "cat-sitting.webp" : "cat-nav-peek.webp"}`}
                alt=""
                aria-hidden="true"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.45 }}
              />
            )}
          </AnimatePresence>
          <header className="app-header">
            <button
              className="brand"
              onClick={() => setTab("home")}
              aria-label="ours. — головна"
            >
              ours<span>.</span>
            </button>
            <div className="header-right">
              <span
                className={demo ? "demo-badge" : "sync-badge"}
                title={
                  demo
                    ? "Деморежим · лише на цьому пристрої"
                    : sync === "live"
                      ? "Ваш приватний простір"
                      : "Відновлюємо з’єднання"
                }
              >
                <i />
                {demo ? "Демо" : "Для двох"}
              </span>
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
              <WifiOff size={14} />
              <span>
                {!online
                  ? "Без інтернету · зміни ще не збережені"
                  : failure
                    ? "Не вдалося оновити простір"
                    : "Відновлюємо живе з’єднання"}
              </span>
              {online && (
                <button
                  aria-label="Оновити дані"
                  onClick={() => void refresh()}
                >
                  <RefreshCw size={15} />
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
                  <motion.div className="tab-view" key={tab} {...enter}>
                    {tab === "home" ? (
                      <Home navigate={setTab} />
                    ) : tab === "shopping" ? (
                      <Shopping />
                    ) : tab === "menu" ? (
                      <Menu />
                    ) : tab === "movies" ? (
                      <Movies />
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
                onPointerEnter={() => {
                  void screens[id]().catch(() => {});
                }}
                onFocus={() => {
                  void screens[id]().catch(() => {});
                }}
                className={tab === id ? "active" : ""}
              >
                {tab === id && (
                  <motion.span
                    className="navigation-active"
                    layoutId="navigation-active"
                    transition={spring}
                  />
                )}
                <span className="nav-content">
                  <Icon size={20} strokeWidth={tab === id ? 2 : 1.7} />
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
          </AnimatePresence>
          {needRefresh && !settings && (
            <div className="update-banner glass">
              <span>Нова версія ours.</span>
              <Button
                className="ghost"
                onClick={() => void updateServiceWorker(true)}
              >
                Оновити
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
