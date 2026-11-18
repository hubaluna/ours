import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
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
  Wallet,
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
import {
  MascotContext,
  type MascotContextValue,
  type MascotPose,
} from "./components/MascotContext";
import { CatMascot } from "./components/CatMascot";
import { getCatReaction, playCatSound } from "./lib/cat-sound";
import { extractShareTargetUrl } from "./lib/share-target";
const UniversalShareImport = lazy(() =>
  import("./components/UniversalShareImport").then((m) => ({
    default: m.UniversalShareImport,
  })),
);
const screens = {
  home: () => import("./features/Home"),
  shopping: () => import("./features/Shopping"),
  menu: () => import("./features/Menu"),
  movies: () => import("./features/Movies"),
  wishes: () => import("./features/Wishes"),
  plans: () => import("./features/Plans"),
  plants: () => import("./features/Plants"),
  budget: () => import("./features/Budget"),
};
const Home = lazy(screens.home),
  Shopping = lazy(screens.shopping),
  Menu = lazy(screens.menu),
  Movies = lazy(screens.movies),
  Wishes = lazy(screens.wishes),
  Plans = lazy(screens.plans),
  Plants = lazy(screens.plants),
  Budget = lazy(screens.budget),
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
  { placement: "panel", image: "cat-carpet-sitting.webp" },
  { placement: "title", image: "cat-bed-paw.webp" },
  { placement: "nav", image: "cat-bed-paw.webp" },
];

function useOccasionalCat(): MascotContextValue {
  const [pose, setPose] = useState<MascotPose>(null);
  const [bubble, setBubble] = useState<{ text: string; key: number } | null>(
    null,
  );
  const [isSquishing, setIsSquishing] = useState(false);

  const tapCountRef = useRef(0);
  const lastTapTimeRef = useRef(0);
  const previousReactionRef = useRef<string | undefined>(undefined);
  const hideTimerRef = useRef<number | undefined>(undefined);
  const bubbleTimerRef = useRef<number | undefined>(undefined);
  const squishTimerRef = useRef<number | undefined>(undefined);
  const scheduleRef = useRef<() => void>(() => {});
  const momentsRef = useRef(0);

  const clearTimers = () => {
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    if (bubbleTimerRef.current) window.clearTimeout(bubbleTimerRef.current);
    if (squishTimerRef.current) window.clearTimeout(squishTimerRef.current);
  };

  const tapCat = useCallback(() => {
    const now = Date.now();
    // After 2.5s of inactivity, reset streak so the next tap plays sound
    if (now - lastTapTimeRef.current > 2500) {
      tapCountRef.current = 0;
    }
    lastTapTimeRef.current = now;
    tapCountRef.current++;
    const taps = tapCountRef.current;

    // Reset 10-second hide timer on tap to extend visibility
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      setPose(null);
      setBubble(null);
      momentsRef.current++;
      scheduleRef.current();
    }, 10000);

    // Trigger squish animation on every tap
    setIsSquishing(true);
    if (squishTimerRef.current) window.clearTimeout(squishTimerRef.current);
    squishTimerRef.current = window.setTimeout(() => {
      setIsSquishing(false);
    }, 380);

    setPose((currentPose) => {
      if (!currentPose) return null;

      const image = currentPose.image;

      // Play sound on alternating taps (через один тап: 1-й, 3-й, 5-й...)
      if (taps % 2 === 1) {
        playCatSound(image);
      }

      // Trigger speech bubble with reaction
      const reactionText = getCatReaction(
        image,
        previousReactionRef.current,
      );
      previousReactionRef.current = reactionText;
      setBubble({ text: reactionText, key: Date.now() });

      if (bubbleTimerRef.current) window.clearTimeout(bubbleTimerRef.current);
      bubbleTimerRef.current = window.setTimeout(() => {
        setBubble(null);
      }, 1400);

      // Keep original cat image without changing pose
      return currentPose;
    });
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let sceneIndex = 0,
      showTimer: number | undefined;
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
            momentsRef.current++;
            schedule();
            return;
          }
          const scene = catScenes[sceneIndex];
          const navSlot = (sceneIndex * 2 + 1) % tabs.length;
          const newPose: MascotPose = {
            placement: scene.placement,
            image: scene.image,
            navSlot,
          };
          tapCountRef.current = 0;
          setBubble(null);
          setIsSquishing(false);
          setPose(newPose);

          sceneIndex = (sceneIndex + 1) % catScenes.length;

          if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
          hideTimerRef.current = window.setTimeout(() => {
            setPose(null);
            setBubble(null);
            momentsRef.current++;
            schedule();
          }, 10000);
        },
        momentsRef.current === 0 ? 1200 : 4500,
      );
    };

    scheduleRef.current = schedule;

    const pause = () => {
      if (isBusy()) {
        setPose(null);
        setBubble(null);
      }
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
      clearTimers();
      document.removeEventListener("focusin", pause);
      document.removeEventListener("visibilitychange", pause);
      observer.disconnect();
    };
  }, []);

  if (!pose) return null;

  return {
    ...pose,
    tapCat,
    bubble,
    isSquishing,
  };
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
  const pendingBudgetCount = data.budgetTransactions.filter(
    (tx) =>
      tx.status === "needs_review" &&
      (!tx.is_private || tx.user_id === userId),
  ).length;
  const [sharedUrl, setSharedUrl] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const extracted = extractShareTargetUrl(window.location.search);
    if (extracted) {
      window.history.replaceState({}, "", window.location.pathname);
    }
    return extracted;
  });

  useEffect(() => {
    const extracted = extractShareTargetUrl(window.location.search);
    if (extracted) {
      window.history.replaceState({}, "", window.location.pathname);
      setSharedUrl(extracted);
    }
  }, []);
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
      void syncLocalReminderNotifications(data.plants, data.events, kyivDate());
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
        <MascotContext.Provider value={mascot}>
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
                    <CatMascot placement="logo" />
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
                  className={`header-wallet-btn${tab === "budget" ? " active" : ""}`}
                  onClick={() => setTab(tab === "budget" ? "home" : "budget")}
                  onPointerEnter={() => {
                    void screens.budget().catch(() => {});
                  }}
                  aria-label="Відкрити бюджет"
                  aria-current={tab === "budget" ? "page" : undefined}
                >
                  <Wallet size={18} strokeWidth={tab === "budget" ? 2.1 : 1.75} />
                  {pendingBudgetCount > 0 && (
                    <span className="header-wallet-badge">
                      {pendingBudgetCount > 9 ? "9+" : pendingBudgetCount}
                    </span>
                  )}
                </button>
                <button
                  className="avatar-button"
                  onClick={() => setSettings(true)}
                  aria-label="Відкрити налаштування"
                >
                  <Avatar name={me?.name ?? "Я"} path={me?.avatar_path} />
                </button>
              </div>
            </header>
            {(!online ||
              failure ||
              (!demo && (sync !== "live" || queuedShoppingCount > 0))) && (
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
            <main id="main-content">
              {loading ? (
                <Skeleton />
              ) : (
                <Suspense fallback={<Skeleton />}>
                  <AnimatePresence mode="wait">
                    <motion.div className="tab-view" key={tab} {...enter}>
                      {tab === "home" ? (
                        <Home navigate={setTab} />
                      ) : tab === "budget" ? (
                        <Budget />
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
                  <CatMascot placement="panel" />
                )}
              </AnimatePresence>
            </main>
            <nav className="bottom-nav glass" aria-label="Основна навігація">
              <AnimatePresence>
                {mascot?.placement === "nav" && <CatMascot placement="nav" />}
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
              {sharedUrl && (
                <Suspense fallback={null}>
                  <UniversalShareImport
                    url={sharedUrl}
                    onClose={() => setSharedUrl(null)}
                    onNavigateTab={(targetTab) => setTab(targetTab)}
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
        </MascotContext.Provider>
      )}
    </MotionConfig>
  );
}
