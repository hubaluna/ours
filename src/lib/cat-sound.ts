const CAT_MUTED_KEY = "ours-cat-muted";
export const MASCOT_LEVEL_KEY = "ours-mascot-level";

export type MascotLevel = 0 | 1 | 2 | 3;

export const MASCOT_LEVEL_DESCRIPTIONS: Record<
  MascotLevel,
  { label: string; title: string; hint: string }
> = {
  0: {
    label: "Вимкнено",
    title: "Луна відпочиває",
    hint: "Кішка спить у своїй кімнаті й не з’являється в інтерфейсі.",
  },
  1: {
    label: "Рідко",
    title: "Тиха присутність",
    hint: "З’являється зрідка й спокійно дрімає без спливаючих фраз і звуків.",
  },
  2: {
    label: "Базовий",
    title: "Спокійний компаньйон",
    hint: "Неспішно змінює улюблені місця, реагує на дотики та муркоче.",
  },
  3: {
    label: "Жвавий",
    title: "Повна взаємодія",
    hint: "Природний ритм без миготіння: інколи вітається, муркоче й любить погладжування.",
  },
};

export function getMascotLevel(): MascotLevel {
  try {
    if (typeof localStorage === "undefined") return 3;
    const raw = localStorage.getItem(MASCOT_LEVEL_KEY);
    if (raw === null) return 3;
    const parsed = Number(raw);
    if (parsed >= 0 && parsed <= 3) return parsed as MascotLevel;
    return 3;
  } catch {
    return 3;
  }
}

export function setMascotLevel(level: MascotLevel): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(MASCOT_LEVEL_KEY, String(level));
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("ours-mascot-level-change", { detail: level }),
      );
    }
  } catch {
    // Ignore localStorage errors
  }
}

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

let cachedNoiseBuffer: AudioBuffer | null = null;
let cachedNoiseCtx: AudioContext | null = null;

function getBreathNoiseBuffer(ctx: AudioContext): AudioBuffer | null {
  try {
    if (cachedNoiseBuffer && cachedNoiseCtx === ctx) {
      return cachedNoiseBuffer;
    }
    const sampleRate = ctx.sampleRate || 44100;
    const length = Math.floor(sampleRate * 2);
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    // Warm pink/brown-tinted noise for organic feline breath and purr airflow
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + white * 0.029;
      b1 = 0.985 * b1 + white * 0.032;
      b2 = 0.95 * b2 + white * 0.048;
      data[i] = Math.max(-1, Math.min(1, (b0 + b1 + b2 + white * 0.018) * 2.4));
    }
    cachedNoiseBuffer = buffer;
    cachedNoiseCtx = ctx;
    return buffer;
  } catch {
    return null;
  }
}

function playPurr(ctx: AudioContext, now: number, duration = 1.25) {
  // Realistic velvety cat purr: ~26 Hz glottal rumble + breath airflow modulated
  // at the same 26 Hz rate across a natural inhale + exhale breathing wave.
  const purrRate = 25.5 + Math.random() * 2.2;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  // Inhale swell -> brief breath turn -> softer exhale -> gentle fade
  master.gain.linearRampToValueAtTime(0.28, now + duration * 0.22);
  master.gain.linearRampToValueAtTime(0.11, now + duration * 0.48);
  master.gain.linearRampToValueAtTime(0.24, now + duration * 0.7);
  master.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  master.connect(ctx.destination);

  // Layer 1: Warm resonant chest rumble (sawtooth harmonic pulse train @ ~26 Hz)
  const rumbleOsc = ctx.createOscillator();
  rumbleOsc.type = "sawtooth";
  rumbleOsc.frequency.setValueAtTime(purrRate, now);
  rumbleOsc.frequency.linearRampToValueAtTime(
    purrRate * 0.95,
    now + duration * 0.5,
  );
  rumbleOsc.frequency.linearRampToValueAtTime(purrRate * 1.02, now + duration);

  // Sub-chest warmth (2x fundamental for mobile speaker audibility)
  const chestOsc = ctx.createOscillator();
  chestOsc.type = "triangle";
  chestOsc.frequency.setValueAtTime(purrRate * 2, now);

  const chestMix = ctx.createGain();
  chestMix.gain.setValueAtTime(0.45, now);

  const rumbleLp = ctx.createBiquadFilter();
  rumbleLp.type = "lowpass";
  rumbleLp.frequency.setValueAtTime(220, now);
  rumbleLp.Q.setValueAtTime(1.3, now);

  const chestFormant = ctx.createBiquadFilter();
  chestFormant.type = "peaking";
  chestFormant.frequency.setValueAtTime(115, now);
  chestFormant.Q.setValueAtTime(1.8, now);
  chestFormant.gain.setValueAtTime(5, now);

  const rumbleGain = ctx.createGain();
  rumbleGain.gain.setValueAtTime(0.75, now);

  rumbleOsc.connect(rumbleLp);
  chestOsc.connect(chestMix);
  chestMix.connect(rumbleLp);
  rumbleLp.connect(chestFormant);
  chestFormant.connect(rumbleGain);
  rumbleGain.connect(master);

  rumbleOsc.start(now);
  chestOsc.start(now);
  rumbleOsc.stop(now + duration + 0.04);
  chestOsc.stop(now + duration + 0.04);

  // Layer 2: Soft rhythmic breath texture modulated at the purr pulse rate
  const noiseBuf = getBreathNoiseBuffer(ctx);
  if (noiseBuf) {
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    noise.loop = true;

    const breathBp = ctx.createBiquadFilter();
    breathBp.type = "bandpass";
    breathBp.frequency.setValueAtTime(360, now);
    breathBp.Q.setValueAtTime(1.1, now);

    const breathAmp = ctx.createGain();
    breathAmp.gain.setValueAtTime(0.28, now);

    const pulseLfo = ctx.createOscillator();
    pulseLfo.type = "sine";
    pulseLfo.frequency.setValueAtTime(purrRate, now);
    const pulseDepth = ctx.createGain();
    pulseDepth.gain.setValueAtTime(0.22, now);

    pulseLfo.connect(pulseDepth);
    pulseDepth.connect(breathAmp.gain);

    noise.connect(breathBp);
    breathBp.connect(breathAmp);
    breathAmp.connect(master);

    noise.start(now);
    pulseLfo.start(now);
    noise.stop(now + duration + 0.04);
    pulseLfo.stop(now + duration + 0.04);
  }
}

function playVocalFormantVoice(
  ctx: AudioContext,
  now: number,
  options: {
    duration: number;
    pitchPoints: Array<[number, number]>;
    f1Points: Array<[number, number]>;
    f2Points: Array<[number, number]>;
    f3Points: Array<[number, number]>;
    peakGain: number;
    trillHz?: number;
    trillDepth?: number;
    breathAmount?: number;
  },
) {
  const {
    duration,
    pitchPoints,
    f1Points,
    f2Points,
    f3Points,
    peakGain,
    trillHz,
    trillDepth = 0,
    breathAmount = 0.025,
  } = options;

  // Glottal pulse source (sawtooth gives natural harmonic series for formants)
  const source = ctx.createOscillator();
  source.type = "sawtooth";
  source.frequency.setValueAtTime(pitchPoints[0][1], now);
  for (let i = 1; i < pitchPoints.length; i++) {
    const [tRatio, hz] = pitchPoints[i];
    source.frequency.exponentialRampToValueAtTime(
      Math.max(80, hz),
      now + duration * tRatio,
    );
  }

  // Subtle organic vibrato so voice feels alive rather than robotic
  const vibrato = ctx.createOscillator();
  vibrato.type = "sine";
  vibrato.frequency.setValueAtTime(5.6 + Math.random() * 1.2, now);
  const vibratoGain = ctx.createGain();
  vibratoGain.gain.setValueAtTime(7, now);
  vibrato.connect(vibratoGain);
  vibratoGain.connect(source.frequency);

  // Pre-filter source to soften harsh high sawtooth harmonics
  const glottalTilt = ctx.createBiquadFilter();
  glottalTilt.type = "lowpass";
  glottalTilt.frequency.setValueAtTime(3400, now);
  glottalTilt.Q.setValueAtTime(0.6, now);
  source.connect(glottalTilt);

  // Master envelope
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, now);
  env.gain.linearRampToValueAtTime(peakGain, now + duration * 0.16);
  env.gain.setValueAtTime(peakGain * 0.92, now + duration * 0.56);
  env.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  // Soft output warmth filter
  const warmOut = ctx.createBiquadFilter();
  warmOut.type = "lowpass";
  warmOut.frequency.setValueAtTime(3600, now);
  env.connect(warmOut);
  warmOut.connect(ctx.destination);

  // Optional rolled purr-trill modulation ("mrrrp")
  if (trillHz && trillDepth > 0) {
    const trillOsc = ctx.createOscillator();
    trillOsc.type = "sine";
    trillOsc.frequency.setValueAtTime(trillHz, now);
    const trillGain = ctx.createGain();
    trillGain.gain.setValueAtTime(peakGain * trillDepth, now);
    trillGain.gain.linearRampToValueAtTime(0.001, now + duration * 0.8);
    trillOsc.connect(trillGain);
    trillGain.connect(env.gain);
    trillOsc.start(now);
    trillOsc.stop(now + duration + 0.03);
  }

  // Parallel vocal-tract formant resonators (F1, F2, F3 -> "m-e-a-o-u")
  const formants: Array<{
    points: Array<[number, number]>;
    q: number;
    gain: number;
  }> = [
    { points: f1Points, q: 4.2, gain: 1.0 },
    { points: f2Points, q: 5.5, gain: 0.65 },
    { points: f3Points, q: 6.5, gain: 0.22 },
  ];

  for (const f of formants) {
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.setValueAtTime(f.q, now);
    bp.frequency.setValueAtTime(f.points[0][1], now);
    for (let i = 1; i < f.points.length; i++) {
      const [tRatio, hz] = f.points[i];
      bp.frequency.exponentialRampToValueAtTime(hz, now + duration * tRatio);
    }
    const fg = ctx.createGain();
    fg.gain.setValueAtTime(f.gain, now);
    glottalTilt.connect(bp);
    bp.connect(fg);
    fg.connect(env);
  }

  // Subtle feline aspiration breath layer
  const noiseBuf = getBreathNoiseBuffer(ctx);
  if (noiseBuf && breathAmount > 0) {
    const breath = ctx.createBufferSource();
    breath.buffer = noiseBuf;
    const breathFilter = ctx.createBiquadFilter();
    breathFilter.type = "bandpass";
    breathFilter.frequency.setValueAtTime(1750, now);
    breathFilter.Q.setValueAtTime(1.4, now);
    const breathGain = ctx.createGain();
    breathGain.gain.setValueAtTime(breathAmount, now);
    breath.connect(breathFilter);
    breathFilter.connect(breathGain);
    breathGain.connect(env);
    breath.start(now);
    breath.stop(now + duration + 0.03);
  }

  source.start(now);
  vibrato.start(now);
  source.stop(now + duration + 0.03);
  vibrato.stop(now + duration + 0.03);
}

function playChirp(ctx: AudioContext, now: number) {
  // Friendly feline greeting trill ("мрр-п?"): rolled upward purr-chirp
  const shift = 0.95 + Math.random() * 0.1;
  playVocalFormantVoice(ctx, now, {
    duration: 0.29,
    pitchPoints: [
      [0, 390 * shift],
      [0.35, 510 * shift],
      [0.82, 820 * shift],
      [1, 740 * shift],
    ],
    f1Points: [
      [0, 440],
      [0.5, 760],
      [1, 620],
    ],
    f2Points: [
      [0, 1250],
      [0.65, 2250],
      [1, 1850],
    ],
    f3Points: [
      [0, 2700],
      [0.7, 3250],
      [1, 2900],
    ],
    peakGain: 0.34,
    trillHz: 29,
    trillDepth: 0.42,
    breathAmount: 0.035,
  });
}

function playMeow(ctx: AudioContext, now: number) {
  // Expressive feline "м-е-а-о-у" with natural variant selection
  const variant = Math.floor(Math.random() * 3);
  const shift = 0.96 + Math.random() * 0.08;

  if (variant === 0) {
    // Classic tender meow ("мяяу")
    playVocalFormantVoice(ctx, now, {
      duration: 0.48,
      pitchPoints: [
        [0, 500 * shift],
        [0.24, 780 * shift],
        [0.62, 650 * shift],
        [1, 430 * shift],
      ],
      f1Points: [
        [0, 420],
        [0.28, 960],
        [0.68, 760],
        [1, 460],
      ],
      f2Points: [
        [0, 1300],
        [0.3, 2320],
        [0.72, 1520],
        [1, 1020],
      ],
      f3Points: [
        [0, 2800],
        [0.35, 3300],
        [1, 2550],
      ],
      peakGain: 0.36,
      breathAmount: 0.03,
    });
  } else if (variant === 1) {
    // Soft inquisitive meow ("мяу?")
    playVocalFormantVoice(ctx, now, {
      duration: 0.4,
      pitchPoints: [
        [0, 470 * shift],
        [0.35, 740 * shift],
        [0.8, 820 * shift],
        [1, 680 * shift],
      ],
      f1Points: [
        [0, 440],
        [0.36, 920],
        [1, 560],
      ],
      f2Points: [
        [0, 1350],
        [0.4, 2280],
        [1, 1480],
      ],
      f3Points: [
        [0, 2850],
        [0.5, 3350],
        [1, 2800],
      ],
      peakGain: 0.34,
      trillHz: 27,
      trillDepth: 0.16,
      breathAmount: 0.03,
    });
  } else {
    // Dreamy soft meow ("мряу…")
    playVocalFormantVoice(ctx, now, {
      duration: 0.54,
      pitchPoints: [
        [0, 440 * shift],
        [0.28, 660 * shift],
        [0.66, 540 * shift],
        [1, 390 * shift],
      ],
      f1Points: [
        [0, 400],
        [0.3, 860],
        [0.7, 640],
        [1, 420],
      ],
      f2Points: [
        [0, 1220],
        [0.32, 2050],
        [0.75, 1340],
        [1, 960],
      ],
      f3Points: [
        [0, 2700],
        [0.35, 3100],
        [1, 2450],
      ],
      peakGain: 0.32,
      trillHz: 26,
      trillDepth: 0.22,
      breathAmount: 0.035,
    });
  }
}

function playHappyTrill(ctx: AudioContext, now: number) {
  // Joyful streak petting: sweet rolled greeting trill melting into a warm purr
  playVocalFormantVoice(ctx, now, {
    duration: 0.34,
    pitchPoints: [
      [0, 430],
      [0.38, 760],
      [0.75, 860],
      [1, 640],
    ],
    f1Points: [
      [0, 460],
      [0.45, 920],
      [1, 560],
    ],
    f2Points: [
      [0, 1380],
      [0.5, 2350],
      [1, 1520],
    ],
    f3Points: [
      [0, 2850],
      [0.5, 3400],
      [1, 2750],
    ],
    peakGain: 0.34,
    trillHz: 28,
    trillDepth: 0.45,
    breathAmount: 0.03,
  });
  playPurr(ctx, now + 0.18, 0.95);
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
