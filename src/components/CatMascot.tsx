import { useContext, type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MascotContext, type MascotPlacement } from "./MascotContext";

const initialY: Record<MascotPlacement, number> = {
  logo: 6,
  title: 6,
  panel: 10,
  nav: 10,
};

const exitY: Record<MascotPlacement, number> = {
  logo: 5,
  title: 5,
  panel: 8,
  nav: 8,
};

const mascotClass: Record<MascotPlacement, string> = {
  logo: "brand-mascot",
  title: "title-mascot",
  panel: "panel-mascot",
  nav: "nav-mascot",
};

const PEEK_IMAGES = new Set(["cat-nav-peek.webp", "cat-bed-look.webp"]);
const LOW_IMAGES = new Set([
  "cat-sleeping.webp",
  "cat-bed-loaf.webp",
  "cat-sofa-loaf.webp",
]);

export function CatMascot({
  placement,
  className = "",
}: {
  placement: MascotPlacement;
  className?: string;
}) {
  const mascot = useContext(MascotContext);

  if (!mascot || mascot.placement !== placement) return null;

  const isPeek = placement === "nav" && PEEK_IMAGES.has(mascot.image);
  const isLow = LOW_IMAGES.has(mascot.image);

  const imageClassName = `${mascotClass[placement]} ${
    isPeek ? "nav-mascot-peek" : ""
  } ${isLow ? "mascot-pose-low" : ""} ${
    mascot.isSquishing ? "is-squishing" : ""
  }`.trim();

  const wrapClassName = [
    "cat-mascot-wrap",
    `cat-mascot-wrap-${placement}`,
    isPeek ? "cat-mascot-peek" : "",
    isLow ? "cat-mascot-low" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const wrapStyle: CSSProperties | undefined =
    placement === "nav"
      ? {
          left: `clamp(56px, ${((mascot.navSlot ?? 2) + 0.5) * (100 / 6)}%, calc(100% - 56px))`,
        }
      : undefined;

  const bubblePlacementClass =
    placement === "logo" || placement === "title"
      ? "cat-bubble cat-bubble-below"
      : "cat-bubble";

  return (
    <motion.span
      className={wrapClassName}
      style={wrapStyle}
      role="button"
      tabIndex={0}
      aria-label="Погладити кішку"
      onClick={(e) => {
        e.stopPropagation();
        mascot.tapCat();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          mascot.tapCat();
        }
      }}
      initial={{ opacity: 0, y: initialY[placement], scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: exitY[placement], scale: 0.94 }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
    >
      <img
        key={mascot.image}
        className={imageClassName}
        src={`${import.meta.env.BASE_URL}art/${mascot.image}`}
        alt=""
        aria-hidden="true"
      />
      <AnimatePresence>
        {mascot.bubble && (
          <span key={mascot.bubble.key} className={bubblePlacementClass}>
            {mascot.bubble.text}
          </span>
        )}
        {mascot.isSquishing && (
          <span className="cat-heart-sparkle" aria-hidden="true">
            ♥
          </span>
        )}
      </AnimatePresence>
    </motion.span>
  );
}
