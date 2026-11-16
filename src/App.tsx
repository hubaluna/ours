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
  Sprout,
  WifiOff,
  X,
} from "lucide-react";
import { useApp } from "./hooks/AppContext";
import { useTheme } from "./hooks/useTheme";
import { Auth, PairSetup } from "./features/Auth";
import { Avatar, Button, Skeleton, Toast } from "./components/ui";
import { spring, enter } from "./lib/motion";
import type { Tab } from "./lib/types";
import { kyivDate } from "./lib/utils";
import { syncLocalReminderNotifications } from "./lib/reminder-notifications";
import { useRegisterSW } from "virtual:pwa-register/react";
import { MascotContext, type MascotPose } from "./components/MascotContext";
const screens = {
  home: () => import("./features/Home"),
  shopping: () => import("./features/Shopping"),
  menu: () => import("./features/Menu"),
  movies: () => import("./features/Movies"),
  wishes: () => import("./features/Wishes"),
  plans: () => import("./features/Plans"),
  plants: () => import("./features/Plants"),
};
const Home = lazy(screens.home),
  Shopping = lazy(screens.shopping),
  Menu = lazy(screens.menu),
  Movies = lazy(screens.movies),
  Wishes = lazy(screens.wishes),
  Plans = lazy(screens.plans),
  Plants = lazy(screens.plants),
  Settings = lazy(() => import("./features/Settings"));
const tabs = [
  { id: "home", label: "Головна", icon: House },
  { id: "shopping", label: "Покупки", icon: ShoppingBag },
  { id: "menu", label: "Меню", icon: Utensils },
  { id: "movies", label: "Кіно", icon: Film },
  { id: "wishes", label: "Бажання", icon: Gift },
  { id: "plans", label: "Календар", icon: CalendarDays },
  { id: "plants", label: "Рослини", icon: Sprout },
] as const;
const catScenes: Array<{
  placement: "logo" | "title" | "nav" | "panel";
  image: string;
}> = [
  { placement: "nav", image: "cat-nav-peek.webp" },
  { placement: "title", image: "cat-sitting.webp" },
  { placement: "panel", image: "cat-bed-loaf.webp" },
  { placement: "nav", image: "cat-bed-look.webp" },
  { placement: "logo", image: "cat-sitting.webp" },
  { placement: "panel", image: "cat-sleeping.webp" },
  { placement: "title", image: "cat-bed-loaf.webp" },
  { placement: "nav", image: "cat-sitting.webp" },
  { placement: "panel", image: "cat-sofa-loaf.webp" },
];
function useOccasionalCat(): MascotPose {
  const [pose, setPose] = useState<MascotPose>(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let moments = 0,
      sceneIndex = 0,
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
      showTimer = window.setTimeout(
        () => {
          if (isBusy()) {
            moments++;
            schedule();
            return;
          }
          const scene = catScenes[sceneIndex];
          const navSlot = (sceneIndex * 2 + 1) % tabs.length;
          setPose({
            placement: scene.placement,
            image: scene.image,
            navSlot,
          });
          sceneIndex = (sceneIndex + 1) % catScenes.length;
          hideTimer = window.setTimeout(() => {
            setPose(null);
            moments++;
            schedule();
          }, 15000);
        },
        moments === 0 ? 1200 : 4500,
      );
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
    queuedShoppingCount,
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
  useEffect(() => {
    if ((!demo && !coupleId) || loading) return;
    const checkReminders = () => {
      void syncLocalReminderNotifications(
        data.plants,
        data.events,
        kyivDate(),
      );
    };
    checkReminders();
    const timer = window.setInterval(checkReminders, 5 * 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") checkReminders();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [demo, coupleId, loading, data.plants, data.events]);
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
          <header className="app-header">
            <button
              className="brand"
              onClick={() => setTab("home")}
              aria-label="ours. — головна"
            >
              ours<span>.</span>
              <AnimatePresence>
                {mascot?.placement === "logo" && (
                  <motion.img
                    key={mascot.image}
                    className="brand-mascot"
                    src={`${import.meta.env.BASE_URL}art/${mascot.image}`}
                    alt=""
                    aria-hidden="true"
                    initial={{ opacity: 0, y: 8, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.92 }}
                    transition={{ type: "spring", stiffness: 320, damping: 24 }}
                  />
                )}
              </AnimatePresence>
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
          {(!online || failure || (!demo && (sync !== "live" || queuedShoppingCount > 0))) && (
            <div className="connection-banner" role="status">
              <WifiOff size={14} />
              <span>
                {!online
                  ? queuedShoppingCount > 0
                    ? `Без інтернету · збережено в черзі (${queuedShoppingCount})`
                    : "Без інтернету · покупки зберігаються локально"
                  : queuedShoppingCount > 0
                    ? `Синхронізуємо покупки (${queuedShoppingCount})…`
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
          <MascotContext.Provider
            value={mascot?.placement === "title" ? mascot : null}
          >
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
                      ) : tab === "plans" ? (
                        <Plans />
                      ) : (
                        <Plants />
                      )}
                    </motion.div>
                  </AnimatePresence>
                </Suspense>
              )}
              <AnimatePresence>
                {mascot?.placement === "panel" && !loading && (
                  <motion.img
                    key={mascot.image}
                    className="panel-mascot"
                    src={`${import.meta.env.BASE_URL}art/${mascot.image}`}
                    alt=""
                    aria-hidden="true"
                    initial={{ opacity: 0, y: 12, scale: 0.92 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.94 }}
                    transition={{ type: "spring", stiffness: 300, damping: 24 }}
                  />
                )}
              </AnimatePresence>
            </main>
          </MascotContext.Provider>
          <nav className="bottom-nav glass" aria-label="Основна навігація">
            <AnimatePresence>
              {mascot?.placement === "nav" && (
                <motion.img
                  key={`${mascot.image}-${mascot.navSlot ?? 0}`}
                  className={`nav-mascot ${mascot.image === "cat-nav-peek.webp" || mascot.image === "cat-bed-look.webp" ? "nav-mascot-peek" : ""}`}
                  style={{
                    left: `clamp(42px, ${((mascot.navSlot ?? 2) + 0.5) * (100 / tabs.length)}%, calc(100% - 42px))`,
                  }}
                  src={`${import.meta.env.BASE_URL}art/${mascot.image}`}
                  alt=""
                  aria-hidden="true"
                  initial={{ opacity: 0, y: 14, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 12, scale: 0.92 }}
                  transition={{ type: "spring", stiffness: 320, damping: 24 }}
                />
              )}
            </AnimatePresence>
            {tabs.map(({ id, label, icon: Icon }) => (
              <motion.button
                whileTap={{ scale: 0.97 }}
                key={id}
                aria-label={label}
                aria-current={tab === id ? "page" : undefined}
                onClick={() => setTab(id)}
                onPointerEnter={() => {
                  void screens[id]().catch(() => {});
                }}
                onFocus={() => {
                  void screens[id]().catch(() => {});
                }}
                className={`${tab === id ? "active" : ""} tab-${id}`}
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
