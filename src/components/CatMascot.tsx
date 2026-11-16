import { useContext, type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MascotContext, type MascotPlacement } from "./MascotContext";

const initialY: Record<MascotPlacement, number> = {
  logo: 8,
  title: 8,
  panel: 12,
  nav: 14,
};

const exitY: Record<MascotPlacement, number> = {
  logo: 6,
  title: 6,
  panel: 10,
  nav: 12,
};

const mascotClass: Record<MascotPlacement, string> = {
  logo: "brand-mascot",
  title: "title-mascot",
  panel: "panel-mascot",
  nav: "nav-mascot",
};

export function CatMascot({
  placement,
  className = "",
}: {
  placement: MascotPlacement;
  className?: string;
}) {
  const mascot = useContext(MascotContext);

  if (!mascot || mascot.placement !== placement) return null;

  const isPeek =
    placement === "nav" &&
    (mascot.image === "cat-nav-peek.webp" ||
      mascot.image === "cat-bed-look.webp");

  const imageClassName = `${mascotClass[placement]} ${
    isPeek ? "nav-mascot-peek" : ""
  } ${mascot.isSquishing ? "is-squishing" : ""}`.trim();

  const wrapStyle: CSSProperties | undefined =
    placement === "nav"
      ? {
          left: `clamp(42px, ${((mascot.navSlot ?? 2) + 0.5) * (100 / 7)}%, calc(100% - 42px))`,
        }
      : undefined;

  return (
    <motion.span
      className={`cat-mascot-wrap cat-mascot-wrap-${placement} ${className}`.trim()}
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
      initial={{ opacity: 0, y: initialY[placement], scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: exitY[placement], scale: 0.92 }}
      transition={{ type: "spring", stiffness: 320, damping: 24 }}
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
          <span key={mascot.bubble.key} className="cat-bubble">
            {mascot.bubble.text}
          </span>
        )}
      </AnimatePresence>
    </motion.span>
  );
}
