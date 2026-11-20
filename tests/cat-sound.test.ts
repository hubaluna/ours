// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  getCatPoseType,
  getCatReaction,
  getMascotLevel,
  isCatMuted,
  MASCOT_LEVEL_DESCRIPTIONS,
  MASCOT_LEVEL_KEY,
  playCatSound,
  setCatMuted,
  setMascotLevel,
} from "../src/lib/cat-sound";

describe("Cat sound and mascot reactions", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("manages mute state in localStorage with default enabled", () => {
    expect(isCatMuted()).toBe(false);

    setCatMuted(true);
    expect(isCatMuted()).toBe(true);
    expect(localStorage.getItem("ours-cat-muted")).toBe("true");

    setCatMuted(false);
    expect(isCatMuted()).toBe(false);
    expect(localStorage.getItem("ours-cat-muted")).toBeNull();
  });

  it("categorizes poses correctly for purr, chirp, and meow", () => {
    // Purr (sleeping / resting loafs)
    expect(getCatPoseType("cat-sleeping.webp")).toBe("purr");
    expect(getCatPoseType("cat-bed-loaf.webp")).toBe("purr");
    expect(getCatPoseType("cat-sofa-loaf.webp")).toBe("purr");

    // Chirp (playful / peeking / paw)
    expect(getCatPoseType("cat-bed-paw.webp")).toBe("chirp");
    expect(getCatPoseType("cat-bed-look.webp")).toBe("chirp");
    expect(getCatPoseType("cat-nav-peek.webp")).toBe("chirp");

    // Meow (sitting)
    expect(getCatPoseType("cat-sitting.webp")).toBe("meow");
    expect(getCatPoseType("cat-carpet-sitting.webp")).toBe("meow");
  });

  it("returns appropriate micro-bubble reactions matching the pose", () => {
    const sleepReactions = ["мррр… 💤", "ще 5 хвилинок…", "хрр-мрр"];
    for (let i = 0; i < 20; i++) {
      const reaction = getCatReaction("cat-sleeping.webp");
      expect(sleepReactions).toContain(reaction);
    }

    const playfulReactions = [
      "мряу! 🐾",
      "кусь",
      "де сонячний зайчик? ☀️",
      "час смаколиків?",
      "мурк ♥",
    ];
    for (let i = 0; i < 20; i++) {
      const reaction = getCatReaction("cat-sitting.webp");
      expect(playfulReactions).toContain(reaction);
    }
  });

  it("avoids repeating the exact same reaction sequentially when possible", () => {
    const previous = "мррр… 💤";
    const next = getCatReaction("cat-sleeping.webp", previous);
    expect(next).not.toBe(previous);
  });

  it("executes playCatSound safely without throwing", () => {
    expect(() => playCatSound("cat-sitting.webp")).not.toThrow();
    expect(() => playCatSound("cat-sleeping.webp")).not.toThrow();
    expect(() => playCatSound("cat-bed-paw.webp")).not.toThrow();

    setCatMuted(true);
    expect(() => playCatSound("cat-sitting.webp")).not.toThrow();
  });

  it("triggers tactile feedback if supported by browser", () => {
    const vibrateSpy = vi.fn();
    Object.defineProperty(navigator, "vibrate", {
      value: vibrateSpy,
      configurable: true,
      writable: true,
    });

    setCatMuted(false);
    playCatSound("cat-sitting.webp");
    expect(vibrateSpy).toHaveBeenCalledWith(15);
  });

  it("provides rich contextual reactions and streak handling", () => {
    const morningReaction = getCatReaction("cat-sitting.webp", undefined, {
      hour: 8,
    });
    expect(morningReaction).toBeTruthy();

    const streakReaction = getCatReaction("cat-sitting.webp", undefined, {
      streak: 4,
    });
    expect(streakReaction).toMatch(/Мррр-муррр|Тану від задоволення|Муркіт увімкнено|улюблені люди/);

    const plantReaction = getCatReaction("cat-sitting.webp", undefined, {
      completedAllPlants: true,
    });
    expect(plantReaction).toMatch(/рослини|Оазис/);

    const vibrateSpy = vi.fn();
    Object.defineProperty(navigator, "vibrate", {
      value: vibrateSpy,
      configurable: true,
      writable: true,
    });

    setCatMuted(false);
    playCatSound("cat-sitting.webp", 4);
    expect(vibrateSpy).toHaveBeenCalledWith([15, 30, 20]);
  });

  it("manages mascot activity levels in localStorage and dispatches change events", () => {
    // Defaults to 3 (Максимум / Жвавий)
    expect(getMascotLevel()).toBe(3);

    const eventSpy = vi.fn();
    window.addEventListener("ours-mascot-level-change", eventSpy);

    // Set level to 0 (Вимкнено)
    setMascotLevel(0);
    expect(getMascotLevel()).toBe(0);
    expect(localStorage.getItem(MASCOT_LEVEL_KEY)).toBe("0");
    expect(eventSpy).toHaveBeenCalledTimes(1);
    expect(eventSpy.mock.calls[0][0].detail).toBe(0);

    // Set level to 1 (Рідко / Тихий спостерігач)
    setMascotLevel(1);
    expect(getMascotLevel()).toBe(1);
    expect(localStorage.getItem(MASCOT_LEVEL_KEY)).toBe("1");

    // Set level to 2 (Базовий)
    setMascotLevel(2);
    expect(getMascotLevel()).toBe(2);
    expect(localStorage.getItem(MASCOT_LEVEL_KEY)).toBe("2");

    // Invalid values in localStorage fallback to 3
    localStorage.setItem(MASCOT_LEVEL_KEY, "invalid");
    expect(getMascotLevel()).toBe(3);

    localStorage.setItem(MASCOT_LEVEL_KEY, "99");
    expect(getMascotLevel()).toBe(3);

    window.removeEventListener("ours-mascot-level-change", eventSpy);
  });

  it("provides complete metadata descriptions for all mascot levels 0 to 3", () => {
    for (const lvl of [0, 1, 2, 3] as const) {
      const desc = MASCOT_LEVEL_DESCRIPTIONS[lvl];
      expect(desc).toBeDefined();
      expect(desc.label).toBeTruthy();
      expect(desc.title).toBeTruthy();
      expect(desc.hint).toBeTruthy();
    }
  });
});
