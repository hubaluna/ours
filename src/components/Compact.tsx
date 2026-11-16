import { Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useContext, type ReactNode } from "react";
import { Button } from "./ui";
import { MascotContext } from "./MascotContext";
export function ScreenHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  const mascot = useContext(MascotContext);
  return (
    <header className="screen-header">
      <div>
        <div className="screen-title-row">
          <h1>{title}</h1>
          <AnimatePresence mode="wait">
            {mascot?.placement === "title" && (
              <motion.img
                key={mascot.image}
                className="title-mascot"
                src={`${import.meta.env.BASE_URL}art/${mascot.image}`}
                alt=""
                aria-hidden="true"
                initial={{ opacity: 0, y: 8, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.92 }}
                transition={{ type: "spring", stiffness: 320, damping: 24 }}
              />
            )}
          </AnimatePresence>
        </div>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="screen-actions">{children}</div>
    </header>
  );
}
export function AddButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <Button className="add-small" aria-label={label} onClick={onClick}>
      <Plus size={20} />
    </Button>
  );
}
export function PagedList<T>({
  items,
  render,
  empty,
}: {
  items: T[];
  render: (item: T) => ReactNode;
  empty?: ReactNode;
}) {
  return (
    <div className="paged">
      <div className="paged-content">
        {items.length ? (
          <div className="paged-rows">
            {items.map(render)}
          </div>
        ) : (
          empty
        )}
      </div>
    </div>
  );
}
export function BrandArt({ className = "" }: { className?: string }) {
  return (
    <img
      className={`brand-art ${className}`}
      src={`${import.meta.env.BASE_URL}art/ours-glass.webp`}
      alt=""
      aria-hidden="true"
    />
  );
}
