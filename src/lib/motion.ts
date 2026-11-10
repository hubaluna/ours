export const spring = {
  type: "spring" as const,
  stiffness: 380,
  damping: 34,
  mass: 0.85,
};
export const soft = {
  duration: 0.28,
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
};
export const enter = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -5 },
  transition: soft,
};
