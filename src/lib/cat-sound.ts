const CAT_MUTED_KEY = "ours-cat-muted";

export type CatPoseType = "purr" | "chirp" | "meow";

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (typeof window === "undefined") return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return null;
    if (!audioCtx || audioCtx.state === "closed") {
      audioCtx = new AudioCtx();
    }
    if (audioCtx.state === "suspended") {
      void audioCtx.resume();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

export function isCatMuted(): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(CAT_MUTED_KEY) === "true";
  } catch {
    return false;
  }
}

export function setCatMuted(muted: boolean): void {
  try {
    if (typeof localStorage === "undefined") return;
    if (muted) {
      localStorage.setItem(CAT_MUTED_KEY, "true");
    } else {
      localStorage.removeItem(CAT_MUTED_KEY);
    }
  } catch {
    // Ignore localStorage errors in private browsing/sandboxes
  }
}

export function getCatPoseType(image: string): CatPoseType {
  if (
    image === "cat-sleeping.webp" ||
    image === "cat-bed-loaf.webp" ||
    image === "cat-sofa-loaf.webp"
  ) {
    return "purr";
  }
  if (
    image === "cat-bed-paw.webp" ||
    image === "cat-bed-look.webp" ||
    image === "cat-nav-peek.webp"
  ) {
    return "chirp";
  }
  return "meow";
}

export type CatReactionContext = {
  streak?: number;
  hour?: number;
  completedAllPlants?: boolean;
  completedAllShopping?: boolean;
};

export function getCatReaction(
  image: string,
  previous?: string,
  context?: CatReactionContext,
): string {
  const type = getCatPoseType(image);
  const baseOptions =
    type === "purr"
      ? ["мррр… 💤", "ще 5 хвилинок…", "хрр-мрр"]
      : [
          "мряу! 🐾",
          "кусь",
          "де сонячний зайчик? ☀️",
          "час смаколиків?",
          "мурк ♥",
        ];

  if (!context) {
    const filtered = baseOptions.filter((o) => o !== previous);
    const pool = filtered.length > 0 ? filtered : baseOptions;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  const contextualPool: string[] = [];

  if (context.streak && context.streak >= 4) {
    contextualPool.push(
      "Мррр-муррр! Найкращі погладжування ♥",
      "Тану від задоволення... 😻",
      "Муркіт увімкнено на 100%! ✨",
      "Ви мої улюблені люди 🐾",
    );
  } else if (context.streak && context.streak === 3) {
    contextualPool.push(
      "О, почухай ще за вушком! 🐾",
      "Мррр ♥ Затишок на максимум!",
      "Лапки від щастя мнуть ковдру ✨",
    );
  } else if (context.completedAllPlants) {
    contextualPool.push(
      "Всі рослини ситі й зелені! 🌿",
      "Оазис під контролем, мурк! 💧",
    );
  } else if (context.completedAllShopping) {
    contextualPool.push(
      "Холодильник повний — котик спокійний 🐟",
      "Смаколики вдома! Мяу 🐾",
    );
  } else if (context.hour !== undefined) {
    const h = context.hour;
    if (h >= 6 && h < 11) {
      contextualPool.push(
        "Доброго ранку! Час кави? ☕",
        "Потягуськи... Лапки готові до дня 🐾",
        "Хто перший встає — той годує кота 🍳",
      );
    } else if (h >= 11 && h < 18) {
      contextualPool.push(
        "Лежу на сонечку й контролюю затишок 🛋️",
        "Мурк! Чудовий день удвох ✨",
        "Де сонячний зайчик? ☀️",
      );
    } else if (h >= 18 && h <= 23) {
      contextualPool.push(
        "Вечір для обіймів і смаколиків 🍲",
        "Який фільм сьогодні дивимось? 🎬",
        "Муррр... Теплий вечір ♥",
      );
    } else {
      contextualPool.push(
        "Тиць лапкою... Чому ще не спимо? 😴",
        "Тссс... Теплих і солодких снів 🌌",
        "Хрр-мрр біля ваших ніжок 💤",
      );
    }
  }

  const finalPool =
    contextualPool.length > 0
      ? contextualPool
      : baseOptions;
  const filtered = finalPool.filter((o) => o !== previous);
  const pool = filtered.length > 0 ? filtered : finalPool;
  return pool[Math.floor(Math.random() * pool.length)];
}

function playPurr(ctx: AudioContext, now: number) {
  // Carrier oscillator: warm low tone ~62 Hz (with harmonics audible on phone speakers)
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(62, now);

  // Soft lowpass filter ~260 Hz
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(260, now);
  filter.Q.setValueAtTime(1.2, now);

  // Tremolo LFO for rhythmic purr rumble ~24 Hz
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.setValueAtTime(24, now);

  const lfoGain = ctx.createGain();
  lfoGain.gain.setValueAtTime(0.08, now);

  // Master gain node: pleasant volume
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.001, now);
  masterGain.gain.linearRampToValueAtTime(0.24, now + 0.12);
  masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

  lfo.connect(lfoGain);
  lfoGain.connect(masterGain.gain);

  osc.connect(filter);
  filter.connect(masterGain);
  masterGain.connect(ctx.destination);

  osc.start(now);
  lfo.start(now);
  osc.stop(now + 0.65);
  lfo.stop(now + 0.65);
}

function playChirp(ctx: AudioContext, now: number) {
  // Playful upward trill glide 480 Hz -> 780 Hz over 0.22s
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(480, now);
  osc.frequency.exponentialRampToValueAtTime(780, now + 0.22);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(1600, now);

  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.001, now);
  masterGain.gain.linearRampToValueAtTime(0.28, now + 0.04);
  masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

  osc.connect(filter);
  filter.connect(masterGain);
  masterGain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.22);
}

function playMeow(ctx: AudioContext, now: number) {
  // Gentle meow frequency contour: 520 Hz -> 720 Hz -> 460 Hz over 0.32s
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(520, now);
  osc.frequency.exponentialRampToValueAtTime(720, now + 0.14);
  osc.frequency.exponentialRampToValueAtTime(460, now + 0.32);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(1400, now);

  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.001, now);
  masterGain.gain.linearRampToValueAtTime(0.28, now + 0.05);
  masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

  osc.connect(filter);
  filter.connect(masterGain);
  masterGain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.32);
}

function playHappyTrill(ctx: AudioContext, now: number) {
  // Melodic joyful upward purr-trill for streak pet interactions
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(560, now);
  osc.frequency.exponentialRampToValueAtTime(840, now + 0.12);
  osc.frequency.exponentialRampToValueAtTime(720, now + 0.28);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(1800, now);

  const lfo = ctx.createOscillator();
  lfo.type = "triangle";
  lfo.frequency.setValueAtTime(30, now);
  const lfoGain = ctx.createGain();
  lfoGain.gain.setValueAtTime(0.06, now);

  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.001, now);
  masterGain.gain.linearRampToValueAtTime(0.26, now + 0.05);
  masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

  lfo.connect(lfoGain);
  lfoGain.connect(masterGain.gain);

  osc.connect(filter);
  filter.connect(masterGain);
  masterGain.connect(ctx.destination);

  osc.start(now);
  lfo.start(now);
  osc.stop(now + 0.28);
  lfo.stop(now + 0.28);
}

export function playCatSound(image: string, streak = 1): void {
  if (isCatMuted()) return;

  try {
    if (typeof navigator !== "undefined") {
      if (streak >= 3) {
        navigator.vibrate?.([15, 30, 20]);
      } else {
        navigator.vibrate?.(15);
      }
    }
  } catch {
    // Ignore tactile feedback errors
  }

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const trigger = () => {
      try {
        const now = ctx.currentTime;
        if (streak >= 3) {
          playHappyTrill(ctx, now);
          return;
        }
        const type = getCatPoseType(image);
        if (type === "purr") {
          playPurr(ctx, now);
        } else if (type === "chirp") {
          playChirp(ctx, now);
        } else {
          playMeow(ctx, now);
        }
      } catch {
        // Audio execution safety
      }
    };

    if (ctx.state === "suspended") {
      ctx.resume().then(trigger).catch(() => {});
    } else {
      trigger();
    }
  } catch {
    // AudioContext safely ignored
  }
}
