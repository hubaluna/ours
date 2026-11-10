import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button, IconButton } from "./ui";
export function ScreenHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <header className="screen-header">
      <div>
        <h1>{title}</h1>
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
  rowHeight = 70,
  empty,
}: {
  items: T[];
  render: (item: T) => ReactNode;
  rowHeight?: number;
  empty?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [capacity, setCapacity] = useState(3),
    [index, setIndex] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () =>
      setCapacity(Math.max(1, Math.floor(el.clientHeight / rowHeight)));
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [rowHeight]);
  const pages = Math.max(1, Math.ceil(items.length / capacity)),
    page = Math.min(index, pages - 1),
    start = page * capacity;
  return (
    <div className="paged">
      <div className="paged-content" ref={ref}>
        {items.length ? (
          <div className="paged-rows">
            {items.slice(start, start + capacity).map(render)}
          </div>
        ) : (
          empty
        )}
      </div>
      <div className="pager" aria-label="Сторінки списку">
        <span>
          {items.length
            ? `${start + 1}–${Math.min(start + capacity, items.length)} із ${items.length}`
            : "Поки порожньо"}
        </span>
        <div>
          <IconButton
            label="Попередня сторінка"
            disabled={page === 0}
            onClick={() => setIndex(page - 1)}
          >
            <ChevronLeft size={17} />
          </IconButton>
          <span>
            {page + 1} / {pages}
          </span>
          <IconButton
            label="Наступна сторінка"
            disabled={page === pages - 1}
            onClick={() => setIndex(page + 1)}
          >
            <ChevronRight size={17} />
          </IconButton>
        </div>
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
