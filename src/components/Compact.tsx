import { Plus } from "lucide-react";
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
          {mascot && (
            <img
              className="section-mascot"
              src={`${import.meta.env.BASE_URL}art/${mascot.image}`}
              alt=""
              aria-hidden="true"
            />
          )}
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
      src={`${import.meta.env.BASE_URL}art/ours-glass.png`}
      alt=""
      aria-hidden="true"
    />
  );
}
