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

export function getCatReaction(image: string, previous?: string): string {
  const type = getCatPoseType(image);
  const options =
    type === "purr"
      ? ["мррр… 💤", "ще 5 хвилинок…", "хрр-мрр"]
      : [
          "мряу! 🐾",
          "кусь",
          "де сонячний зайчик? ☀️",
          "час смаколиків?",
          "мурк ♥",
        ];
  const filtered = options.filter((o) => o !== previous);
  const pool = filtered.length > 0 ? filtered : options;
  return pool[Math.floor(Math.random() * pool.length)];
}

function playPurr(ctx: AudioContext, now: number) {
  // Carrier oscillator: low warm frequency ~28 Hz
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(28, now);

  // Soft lowpass filter ~95 Hz
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(95, now);
  filter.Q.setValueAtTime(1.1, now);

  // Tremolo LFO for amplitude modulation ~24 Hz
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.setValueAtTime(24, now);

  const lfoGain = ctx.createGain();
  lfoGain.gain.setValueAtTime(0.045, now);

  // Master gain node: delicate volume <= 0.12
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.001, now);
  masterGain.gain.linearRampToValueAtTime(0.1, now + 0.12);
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
  filter.frequency.setValueAtTime(1400, now);

  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.001, now);
  masterGain.gain.linearRampToValueAtTime(0.11, now + 0.04);
  masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

  osc.connect(filter);
  filter.connect(masterGain);
  masterGain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.22);
}

function playMeow(ctx: AudioContext, now: number) {
  // Gentle meow frequency contour: 520 Hz -> 690 Hz -> 460 Hz over 0.32s
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(520, now);
  osc.frequency.exponentialRampToValueAtTime(690, now + 0.14);
  osc.frequency.exponentialRampToValueAtTime(460, now + 0.32);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(1200, now);

  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.001, now);
  masterGain.gain.linearRampToValueAtTime(0.11, now + 0.05);
  masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

  osc.connect(filter);
  filter.connect(masterGain);
  masterGain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.32);
}

export function playCatSound(image: string): void {
  if (isCatMuted()) return;

  try {
    if (typeof navigator !== "undefined") {
      navigator.vibrate?.(15);
    }
  } catch {
    // Ignore tactile feedback errors
  }

  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const type = getCatPoseType(image);
    if (type === "purr") {
      playPurr(ctx, now);
    } else if (type === "chirp") {
      playChirp(ctx, now);
    } else {
      playMeow(ctx, now);
    }
  } catch {
    // AudioContext safely ignored
  }
}
