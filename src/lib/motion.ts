export const spring = {
  type: "spring" as const,
  stiffness: 380,
  damping: 34,
  mass: 0.85,
};
export const soft = {
  duration: 0.22,
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
};
export const enter = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -3, transition: { duration: 0.1 } },
  transition: soft,
};
