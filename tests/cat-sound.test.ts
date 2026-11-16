// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  getCatPoseType,
  getCatReaction,
  isCatMuted,
  playCatSound,
  setCatMuted,
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
});
