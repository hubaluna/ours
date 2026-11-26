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
  RefreshCw,
  ShoppingBag,
  Sprout,
  Wallet,
  WifiOff,
  X,
} from "lucide-react";
import { useApp } from "./hooks/AppContext";
import { useTheme } from "./hooks/useTheme";
import { supabase } from "./lib/supabase";
import { Auth, PairSetup } from "./features/Auth";
import { Avatar, Button, Skeleton, Toast } from "./components/ui";
import { spring, tabEnter } from "./lib/motion";
import {
  clearImageCache,
  prefetchExternalUrls,
  prefetchImages,
} from "./hooks/useImage";
import type { Tab } from "./lib/types";
import { kyivDate } from "./lib/utils";
import { getDueRecurringPayments } from "./lib/budget";
import { syncLocalReminderNotifications } from "./lib/reminder-notifications";
import { syncExistingPushSubscription } from "./lib/push-notifications";
import { useRegisterSW } from "virtual:pwa-register/react";
import {
  MascotContext,
  type MascotContextValue,
  type MascotPose,
} from "./components/MascotContext";
import { CatMascot } from "./components/CatMascot";
import {
  getCatReaction,
  getMascotLevel,
  playCatSound,
  type MascotLevel,
} from "./lib/cat-sound";
import { extractShareTargetUrl } from "./lib/share-target";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { hardReloadApp } from "./lib/pwa-update";
import {
  decodeWishlistShare,
  fetchSharedWishlistResult,
  type SharedWishlistPayload,
} from "./lib/wishlist-share";
const UniversalShareImport = lazy(() =>
  import("./components/UniversalShareImport").then((m) => ({
    default: m.UniversalShareImport,
  })),
);
const GuestWishlistView = lazy(() =>
  import("./components/GuestWishlistView").then((m) => ({
    default: m.GuestWishlistView,
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
const preloadSettings = () => import("./features/Settings");
const Home = lazy(screens.home),
  Shopping = lazy(screens.shopping),
  Menu = lazy(screens.menu),
  Movies = lazy(screens.movies),
  Wishes = lazy(screens.wishes),
  Plans = lazy(screens.plans),
  Plants = lazy(screens.plants),
  Budget = lazy(screens.budget),
  Settings = lazy(preloadSettings);
const tabs = [
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
  desktopOnly?: boolean;
}> = [
  { placement: "nav", image: "cat-nav-peek.webp" },
  { placement: "title", image: "cat-sleeping.webp" },
  { placement: "nav", image: "cat-sitting.webp" },
  { placement: "logo", image: "cat-sitting.webp" },
  { placement: "title", image: "cat-bed-loaf.webp" },
  { placement: "nav", image: "cat-bed-look.webp" },
  { placement: "panel", image: "cat-carpet-sitting.webp", desktopOnly: true },
  { placement: "nav", image: "cat-sleeping.webp" },
  { placement: "title", image: "cat-sitting.webp" },
  { placement: "logo", image: "cat-sleeping.webp" },
  { placement: "nav", image: "cat-bed-loaf.webp" },
  { placement: "panel", image: "cat-bed-paw.webp", desktopOnly: true },
  { placement: "nav", image: "cat-sofa-loaf.webp" },
];
const SAFE_NAV_SLOTS = [1, 2, 3, 4] as const;

function useOccasionalCat(): MascotContextValue {
  const [level, setLevel] = useState<MascotLevel>(() => getMascotLevel());
  const [pose, setPose] = useState<MascotPose>(null);
  const [bubble, setBubble] = useState<{ text: string; key: number } | null>(
    null,
  );
  const [isSquishing, setIsSquishing] = useState(false);

  const levelRef = useRef<MascotLevel>(level);
  useEffect(() => {
    levelRef.current = level;
  }, [level]);

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

  useEffect(() => {
    const onLevelChange = (e: Event) => {
      const custom = e as CustomEvent<MascotLevel>;
      const next =
        typeof custom.detail === "number" ? custom.detail : getMascotLevel();
      levelRef.current = next;
      setLevel(next);
      if (next === 0) {
        setPose(null);
        setBubble(null);
        clearTimers();
      } else {
        scheduleRef.current();
      }
    };
    window.addEventListener("ours-mascot-level-change", onLevelChange);
    return () => {
      window.removeEventListener("ours-mascot-level-change", onLevelChange);
    };
  }, []);

  const tapCat = useCallback(() => {
    const currentLevel = levelRef.current;
    if (currentLevel === 0) return;

    const now = Date.now();
    // After 2.5s of inactivity, reset streak so the next tap plays sound
    if (now - lastTapTimeRef.current > 2500) {
      tapCountRef.current = 0;
    }
    lastTapTimeRef.current = now;
    tapCountRef.current++;
    const taps = tapCountRef.current;

    // Keep Luna comfortably in place longer after being petted
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      setPose(null);
      setBubble(null);
      momentsRef.current++;
      scheduleRef.current();
    }, currentLevel === 1 ? 18000 : currentLevel === 2 ? 22000 : 26000);

    // Trigger squish animation on every tap
    setIsSquishing(true);
    if (squishTimerRef.current) window.clearTimeout(squishTimerRef.current);
    squishTimerRef.current = window.setTimeout(() => {
      setIsSquishing(false);
    }, 380);

    if (currentLevel === 1) {
      // Level 1: quiet observer — no speech bubble, no sound
      return;
    }

    setPose((currentPose) => {
      if (!currentPose) return null;

      const image = currentPose.image;

      // Play sound on alternating taps (через один тап: 1-й, 3-й, 5-й...)
      if (taps % 2 === 1) {
        playCatSound(image, currentLevel === 3 ? taps : 1);
      }

      const hour = new Date().getHours();
      // Level 2: basic reaction without extra streak/hour context
      // Level 3: rich contextual reaction with streak and hour
      const reactionText =
        currentLevel === 3
          ? getCatReaction(image, previousReactionRef.current, { streak: taps, hour })
          : getCatReaction(image, previousReactionRef.current);

      previousReactionRef.current = reactionText;
      setBubble({ text: reactionText, key: Date.now() });

      if (bubbleTimerRef.current) window.clearTimeout(bubbleTimerRef.current);
      bubbleTimerRef.current = window.setTimeout(() => {
        setBubble(null);
      }, 1500);

      return currentPose;
    });
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (level === 0) {
      setPose(null);
      setBubble(null);
      return;
    }

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
      if (levelRef.current === 0) return;

      // Calm, natural rhythm: Luna stays in one cozy spot longer and rests
      // unhurriedly before moving elsewhere so she never feels distracting.
      const delay =
        momentsRef.current === 0
          ? levelRef.current === 1
            ? 20000
            : levelRef.current === 2
              ? 12000
              : 5000
          : levelRef.current === 1
            ? 95000
            : levelRef.current === 2
              ? 55000
              : 36000;

      showTimer = window.setTimeout(
        () => {
          if (levelRef.current === 0) return;
          if (isBusy()) {
            momentsRef.current++;
            schedule();
            return;
          }
          const isWideDesktop = window.innerWidth >= 820;
          let scene = catScenes[sceneIndex];
          let steps = 0;
          while (scene.desktopOnly && !isWideDesktop && steps < catScenes.length) {
            sceneIndex = (sceneIndex + 1) % catScenes.length;
            scene = catScenes[sceneIndex];
            steps++;
          }
          const navSlot = SAFE_NAV_SLOTS[sceneIndex % SAFE_NAV_SLOTS.length];
          const newPose: MascotPose = {
            placement: scene.placement,
            image: scene.image,
            navSlot,
          };
          tapCountRef.current = 0;
          setIsSquishing(false);
          setPose(newPose);

          // Level 3 only: occasional subtle greeting bubble (every 4th visit)
          if (levelRef.current === 3 && momentsRef.current % 4 === 1) {
            const hour = new Date().getHours();
            const intro = getCatReaction(scene.image, undefined, { hour });
            setBubble({ text: intro, key: Date.now() });
            if (bubbleTimerRef.current) window.clearTimeout(bubbleTimerRef.current);
            bubbleTimerRef.current = window.setTimeout(() => {
              setBubble(null);
            }, 2400);
          } else {
            setBubble(null);
          }

          sceneIndex = (sceneIndex + 1) % catScenes.length;

          if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
          const visibleDuration =
            levelRef.current === 1 ? 24000 : levelRef.current === 2 ? 30000 : 34000;
          hideTimerRef.current = window.setTimeout(() => {
            setPose(null);
            setBubble(null);
            momentsRef.current++;
            schedule();
          }, visibleDuration);
        },
        delay,
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
  }, [level]);

  if (!pose || level === 0) return null;

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
    queuedBudgetCount,
    queuedMutationCount,
    sync,
    refresh,
    notify,
  } = useApp();
  const {
    theme,
    setTheme,
    resolvedTheme,
    lightPalette,
    setLightPalette,
    darkPalette,
    setDarkPalette,
  } = useTheme();
  const mascot = useOccasionalCat();
  const [tab, setTab] = useState<Tab>("home"),
    [settings, setSettings] = useState(false),
    [editBudgetTxId, setEditBudgetTxId] = useState<string | null>(null);
  const dueRecurringCount = getDueRecurringPayments(
    data.budgetRecurring || [],
    kyivDate(),
  ).length;
  const pendingBudgetCount =
    data.budgetTransactions.filter(
      (tx) =>
        tx.status === "needs_review" &&
        (!tx.is_private || tx.user_id === userId),
    ).length + dueRecurringCount;
  const totalQueuedCount =
    queuedShoppingCount + queuedBudgetCount + (queuedMutationCount ?? 0);
  const initialShortId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("w") ||
        (window.location.hash.includes("w=")
          ? new URLSearchParams(window.location.hash.split("?")[1] || "").get("w")
          : null)
      : null;

  const [guestPreviewMode, setGuestPreviewMode] = useState(false);
  const [guestShortId, setGuestShortId] = useState<string | null>(initialShortId);
  const [guestLoadError, setGuestLoadError] = useState(false);
  const [guestWishlistPayload, setGuestWishlistPayload] =
    useState<SharedWishlistPayload | null>(() => {
      if (typeof window === "undefined") return null;
      const searchParams = new URLSearchParams(window.location.search);
      const fromQuery = searchParams.get("shared_wishlist");
      if (fromQuery) {
        const decoded = decodeWishlistShare(fromQuery);
        if (decoded) {
          try {
            sessionStorage.setItem("ours_guest_wishlist", JSON.stringify(decoded));
            window.history.replaceState(null, "", window.location.pathname);
          } catch {
            // ignore
          }
          return decoded;
        }
      }
      if (window.location.hash.includes("shared_wishlist=")) {
        const hashQuery = window.location.hash.split("?")[1] || "";
        const hashParams = new URLSearchParams(hashQuery);
        const fromHash = hashParams.get("shared_wishlist");
        if (fromHash) {
          const decoded = decodeWishlistShare(fromHash);
          if (decoded) {
            try {
              sessionStorage.setItem("ours_guest_wishlist", JSON.stringify(decoded));
              window.history.replaceState(null, "", window.location.pathname);
            } catch {
              // ignore
            }
            return decoded;
          }
        }
      }
      if (initialShortId) {
        try {
          sessionStorage.removeItem("ours_guest_wishlist");
        } catch {
          // ignore
        }
        return null;
      }
      try {
        const saved = sessionStorage.getItem("ours_guest_wishlist");
        if (saved) return JSON.parse(saved);
      } catch {
        // ignore
      }
      return null;
    });

  const isGuestWishlistAttempt =
    Boolean(guestShortId) ||
    (typeof window !== "undefined" &&
      (new URLSearchParams(window.location.search).has("w") ||
        new URLSearchParams(window.location.search).has("shared_wishlist") ||
        window.location.hash.includes("w=") ||
        window.location.hash.includes("shared_wishlist=") ||
        Boolean(
          typeof sessionStorage !== "undefined" &&
            sessionStorage.getItem("ours_guest_wishlist"),
        )));

  const [guestLoading, setGuestLoading] = useState<boolean>(
    () => Boolean(initialShortId) || (isGuestWishlistAttempt && !guestWishlistPayload),
  );

  const loadShortWishlist = useCallback(async (id: string) => {
    setGuestLoading(true);
    setGuestLoadError(false);
    try {
      const outcome = await fetchSharedWishlistResult(id);
      if (outcome.status === "ok") {
        setGuestWishlistPayload(outcome.payload);
        try {
          sessionStorage.setItem(
            "ours_guest_wishlist",
            JSON.stringify(outcome.payload),
          );
          window.history.replaceState(null, "", window.location.pathname);
        } catch {
          // ignore
        }
      } else if (outcome.status === "network_error") {
        setGuestLoadError(true);
      }
    } finally {
      setGuestLoading(false);
    }
  }, []);

  // Load wishlist if short id provided via ?w=
  useEffect(() => {
    if (!initialShortId) return;
    setGuestShortId(initialShortId);
    void loadShortWishlist(initialShortId);
  }, [initialShortId, loadShortWishlist]);
  const [sharedUrl, setSharedUrl] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const extracted = extractShareTargetUrl(window.location.search);
    if (extracted) {
      window.history.replaceState({}, "", window.location.pathname);
    }
    return extracted;
  });

  useEffect(() => {
    // Initial read (covers hard reload with share params)
    const extracted = extractShareTargetUrl(window.location.search);
    if (extracted) {
      window.history.replaceState({}, "", window.location.pathname);
      setSharedUrl(extracted);
    }

    // When iOS brings a PWA to foreground via Share Sheet, the page doesn't
    // reload — it fires pageshow / visibilitychange instead. We re-check the
    // URL at that moment to catch share params that arrive after first render.
    const handleFocus = () => {
      const url = extractShareTargetUrl(window.location.search);
      if (url) {
        window.history.replaceState({}, "", window.location.pathname);
        setSharedUrl(url);
      }
    };
    window.addEventListener("pageshow", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);
    return () => {
      window.removeEventListener("pageshow", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, []);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      let lastCheck = Date.now();
      const checkOnForeground = () => {
        if (document.visibilityState !== "visible") return;
        const now = Date.now();
        if (now - lastCheck < 60_000) return;
        lastCheck = now;
        void registration.update().catch(() => {});
      };
      document.addEventListener("visibilitychange", checkOnForeground);
    },
  });
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
    const warmChunks = () => {
      void Promise.allSettled([
        ...Object.values(screens).map((load) => load()),
        preloadSettings(),
      ]);
    };
    const idleApi = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (idleApi.requestIdleCallback) {
      const idleId = idleApi.requestIdleCallback(warmChunks, { timeout: 2500 });
      return () => idleApi.cancelIdleCallback?.(idleId);
    }
    const timer = window.setTimeout(warmChunks, 800);
    return () => window.clearTimeout(timer);
  }, [demo, coupleId]);
  useEffect(() => {
    if ((!demo && !coupleId) || loading) return;
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean } }
    ).connection;
    if (connection?.saveData) return;
    const timer = window.setTimeout(() => {
      prefetchImages([
        ...data.profiles.map((p) => p.avatar_path),
        ...data.plants.map((p) => p.image_path),
        ...data.wishes.map((w) => w.image_path),
      ]);
      prefetchExternalUrls([
        ...data.movies.slice(0, 24).map((m) => m.poster_url),
        ...data.wishes.slice(0, 20).map((w) => w.image_url),
        ...data.recipes.slice(0, 8).map((r) => r.image_url),
      ]);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [
    demo,
    coupleId,
    loading,
    data.profiles,
    data.plants,
    data.wishes,
    data.movies,
    data.recipes,
  ]);
  const [showReconnectingBanner, setShowReconnectingBanner] = useState(false);
  useEffect(() => {
    if (demo || !online || failure || totalQueuedCount > 0 || sync === "live") {
      setShowReconnectingBanner(false);
      return;
    }
    const timer = window.setTimeout(() => setShowReconnectingBanner(true), 5500);
    return () => window.clearTimeout(timer);
  }, [demo, online, failure, totalQueuedCount, sync]);
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
  useEffect(() => {
    if (demo || !session || !userId || !coupleId || loading) return;
    void syncExistingPushSubscription(userId, coupleId);
  }, [demo, session, userId, coupleId, loading]);
  const me = data.profiles.find((p) => p.id === userId);
  return (
    <MotionConfig reducedMotion="user">
      <Toast />
      {guestWishlistPayload ? (
        <ErrorBoundary>
          <Suspense fallback={<Skeleton />}>
            <GuestWishlistView
              payload={guestWishlistPayload}
              previewMode={guestPreviewMode}
              onExit={
                session || guestPreviewMode
                  ? () => {
                      if (typeof window !== "undefined") {
                        try {
                          sessionStorage.removeItem("ours_guest_wishlist");
                        } catch {
                          // ignore
                        }
                        const url = new URL(window.location.href);
                        url.searchParams.delete("shared_wishlist");
                        url.searchParams.delete("w");
                        window.history.replaceState(
                          {},
                          "",
                          url.pathname + (url.search ? url.search : ""),
                        );
                      }
                      setGuestPreviewMode(false);
                      setGuestWishlistPayload(null);
                    }
                  : undefined
              }
            />
          </Suspense>
        </ErrorBoundary>
      ) : guestLoading ? (
        <div className="app-shell">
          <Skeleton />
        </div>
      ) : isGuestWishlistAttempt && !guestWishlistPayload ? (
        <main className="pair-shell">
          <h1>
            {guestLoadError
              ? "Не вдалося завантажити вішліст"
              : "Вішліст не знайдено"}
          </h1>
          <p>
            {guestLoadError
              ? "Перевірте інтернет-з’єднання та спробуйте ще раз."
              : "Посилання недійсне, застаріло або було видалено автором."}
          </p>
          {guestLoadError && guestShortId && (
            <Button onClick={() => void loadShortWishlist(guestShortId)}>
              Спробувати ще раз
            </Button>
          )}
        </main>
      ) : !authReady ? (
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
            {supabase && (
              <Button
                className="ghost"
                onClick={() => {
                  void clearImageCache();
                  void supabase?.auth.signOut();
                }}
              >
                Вийти з акаунта
              </Button>
            )}
          </main>
        ) : (
          <PairSetup />
        )
      ) : (
        <MascotContext.Provider value={mascot}>
          <div className="app-shell">
            <header className="app-header">
              <div className="brand-wrap">
                <button
                  className={`brand${tab === "home" ? " is-home" : ""}`}
                  onClick={() => setTab("home")}
                  aria-label="ours. — головна"
                  aria-current={tab === "home" ? "page" : undefined}
                >
                  ours<span>.</span>
                </button>
                <AnimatePresence>
                  {mascot?.placement === "logo" && (
                    <CatMascot placement="logo" />
                  )}
                </AnimatePresence>
              </div>
              <div className="header-right">
                {!online ? (
                  <button
                    type="button"
                    className="header-status-badge is-offline"
                    role="status"
                    aria-label={
                      totalQueuedCount > 0
                        ? `Без інтернету · збережено локально (${totalQueuedCount})`
                        : "Без інтернету · зміни зберігаються локально"
                    }
                    title="Немає інтернету — натисніть для деталей"
                    onClick={() =>
                      notify(
                        totalQueuedCount > 0
                          ? `Немає інтернету. У черзі ${totalQueuedCount} змін — вони відправляться автоматично, коли з’явиться зв’язок.`
                          : "Немає інтернету. Зміни збережуться на телефоні й відправляться автоматично, коли з’явиться зв’язок.",
                      )
                    }
                  >
                    <WifiOff size={12} aria-hidden="true" />
                    <span>
                      {totalQueuedCount > 0
                        ? `Офлайн · ${totalQueuedCount}`
                        : "Офлайн"}
                    </span>
                  </button>
                ) : !demo && totalQueuedCount > 0 ? (
                  <button
                    type="button"
                    className="header-status-badge is-syncing"
                    role="status"
                    aria-label={`Синхронізувати зміни (${totalQueuedCount})`}
                    title="Синхронізуємо збережені зміни — натисніть, щоб оновити"
                    onClick={() => void refresh()}
                  >
                    <RefreshCw size={12} aria-hidden="true" />
                    <span>Синхр. · {totalQueuedCount}</span>
                  </button>
                ) : !demo && (failure || showReconnectingBanner) ? (
                  <button
                    type="button"
                    className="header-status-badge is-reconnecting"
                    role="status"
                    aria-label="Оновити дані"
                    title={
                      failure
                        ? "Не вдалося оновити простір — натисніть, щоб повторити"
                        : "Відновлюємо живе з’єднання — натисніть, щоб оновити"
                    }
                    onClick={() => void refresh()}
                  >
                    <RefreshCw size={12} aria-hidden="true" />
                    <span>{failure ? "Оновити" : "З’єднання…"}</span>
                  </button>
                ) : (
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
                )}
                <button
                  className={`header-wallet-btn${tab === "budget" ? " active" : ""}`}
                  onClick={() => setTab(tab === "budget" ? "home" : "budget")}
                  onPointerDown={() => {
                    void screens.budget().catch(() => {});
                  }}
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
                  onPointerDown={() => {
                    void preloadSettings().catch(() => {});
                  }}
                  onPointerEnter={() => {
                    void preloadSettings().catch(() => {});
                  }}
                  aria-label="Відкрити налаштування"
                >
                  <Avatar name={me?.name ?? "Я"} path={me?.avatar_path} />
                </button>
              </div>
            </header>
            <main id="main-content">
              {loading ? (
                <Skeleton />
              ) : (
                <ErrorBoundary key={tab}>
                  <Suspense fallback={<Skeleton />}>
                    <motion.div className="tab-view" key={tab} {...tabEnter}>
                      {tab === "home" ? (
                        <Home
                          navigate={setTab}
                          onEditBudgetTx={(txId) => {
                            setEditBudgetTxId(txId);
                            setTab("budget");
                          }}
                        />
                      ) : tab === "budget" ? (
                        <Budget
                          initialEditTxId={editBudgetTxId}
                          onClearInitialEditTx={() => setEditBudgetTxId(null)}
                        />
                      ) : tab === "shopping" ? (
                        <Shopping />
                      ) : tab === "menu" ? (
                        <Menu />
                      ) : tab === "movies" ? (
                        <Movies />
                      ) : tab === "wishes" ? (
                        <Wishes
                          onOpenGuestWishlist={(code, preview = false) => {
                            setGuestPreviewMode(preview);
                            setGuestWishlistPayload(decodeWishlistShare(code));
                          }}
                        />
                      ) : tab === "plans" ? (
                        <Plans />
                      ) : (
                        <Plants />
                      )}
                    </motion.div>
                  </Suspense>
                </ErrorBoundary>
              )}
            </main>
            <AnimatePresence>
              {mascot?.placement === "panel" && !loading && (
                <CatMascot placement="panel" />
              )}
            </AnimatePresence>
            <nav className="bottom-nav glass" aria-label="Основна навігація">
              <AnimatePresence>
                {mascot?.placement === "nav" && tab !== "budget" && (
                  <CatMascot placement="nav" />
                )}
              </AnimatePresence>
              {tabs.map(({ id, label, icon: Icon }) => (
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  key={id}
                  aria-label={label}
                  title={label}
                  aria-current={tab === id ? "page" : undefined}
                  onClick={() => setTab(id)}
                  onPointerDown={() => {
                    void screens[id]().catch(() => {});
                  }}
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
                    <Icon
                      size={20}
                      strokeWidth={tab === id ? 2.15 : 1.75}
                      aria-hidden="true"
                    />
                    <span>{label}</span>
                  </span>
                </motion.button>
              ))}
            </nav>
            <AnimatePresence>
              {settings && (
                <ErrorBoundary>
                  <Suspense fallback={null}>
                    <Settings
                      onClose={() => setSettings(false)}
                      theme={theme}
                      setTheme={setTheme}
                      resolvedTheme={resolvedTheme}
                      lightPalette={lightPalette}
                      setLightPalette={setLightPalette}
                      darkPalette={darkPalette}
                      setDarkPalette={setDarkPalette}
                      updateServiceWorker={updateServiceWorker}
                    />
                  </Suspense>
                </ErrorBoundary>
              )}
              {sharedUrl && (
                <ErrorBoundary>
                  <Suspense fallback={null}>
                    <UniversalShareImport
                      url={sharedUrl}
                      onClose={() => setSharedUrl(null)}
                      onNavigateTab={(targetTab) => setTab(targetTab)}
                    />
                  </Suspense>
                </ErrorBoundary>
              )}
            </AnimatePresence>
            {needRefresh && !settings && (
              <div className="update-banner glass">
                <span>Нова версія ours.</span>
                <Button
                  className="ghost"
                  onClick={() => void hardReloadApp({ updateServiceWorker })}
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
