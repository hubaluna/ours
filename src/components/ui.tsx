import { createPortal } from "react-dom";
import { AnimatePresence, motion, type HTMLMotionProps } from "motion/react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AlertCircle, ArrowRight, Check, LoaderCircle, X } from "lucide-react";
import { spring, soft } from "../lib/motion";
import { useImage } from "../hooks/useImage";
import { useApp } from "../hooks/AppContext";
export function Button({
  children,
  className = "",
  busy = false,
  ...props
}: Omit<HTMLMotionProps<"button">, "children"> & {
  children?: ReactNode;
  busy?: boolean;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.975 }}
      transition={spring}
      className={`button ${className}`}
      {...props}
      disabled={busy || props.disabled}
      aria-busy={busy}
    >
      {busy ? <LoaderCircle className="spin" size={18} /> : null}
      {children}
    </motion.button>
  );
}
export function IconButton({
  label,
  children,
  ...props
}: Omit<HTMLMotionProps<"button">, "children"> & {
  label: string;
  children: ReactNode;
}) {
  return (
    <Button className="icon-button" aria-label={label} title={label} {...props}>
      {children}
    </Button>
  );
}
export function Avatar({
  name,
  path,
  size = "normal",
}: {
  name: string;
  path?: string | null;
  size?: "normal" | "small" | "large";
}) {
  const url = useImage(path ?? null);
  return (
    <span className={`avatar ${size}`}>
      {url ? (
        <img src={url} alt={name} />
      ) : (
        name.slice(0, 1).toLocaleUpperCase("uk")
      )}
    </span>
  );
}
export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <img
        className="empty-art-image"
        src={`${import.meta.env.BASE_URL}art/ours-glass.png`}
        alt=""
        aria-hidden="true"
      />
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {children}
    </div>
  );
}
export function Skeleton() {
  return (
    <div
      className="skeletons"
      aria-label="Завантажуємо ваш простір"
      role="status"
    >
      {[0, 1, 2].map((i) => (
        <div className="skeleton" key={i}>
          <i />
          <i />
        </div>
      ))}
    </div>
  );
}
export function SectionHeading({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      {action && (
        <button className="text-button" onClick={onAction}>
          {action}
          <ArrowRight size={15} />
        </button>
      )}
    </div>
  );
}
export function Segmented({
  value,
  onChange,
  options,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
  id: string;
}) {
  return (
    <div className="segmented" role="group">
      {options.map((o) => (
        <button
          key={o.id}
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
        >
          {value === o.id && (
            <motion.span
              layoutId={id}
              transition={spring}
              className="segment-active"
            />
          )}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}
export function BottomSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null),
    previous = useRef<HTMLElement | null>(null),
    [dirty, setDirty] = useState(false),
    [confirm, setConfirm] = useState(false);
  const titleId = useId();
  useEffect(() => {
    ref.current
      ?.querySelector<HTMLElement>(
        confirm ? ".discard button" : "[data-autofocus]",
      )
      ?.focus();
  }, [confirm]);
  const requestClose = () => (dirty ? setConfirm(true) : onClose());
  const closeRef = useRef(requestClose);
  useEffect(() => {
    closeRef.current = requestClose;
  });
  useEffect(() => {
    previous.current = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = setTimeout(() => {
      const target =
        ref.current?.querySelector<HTMLElement>("[data-autofocus]") ??
        ref.current?.querySelector<HTMLElement>("input,button");
      target?.focus();
    }, 100);
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
      }
      if (e.key === "Tab") {
        const elements = ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select,textarea,a[href],[tabindex="0"]',
        );
        if (!elements?.length) return;
        const visible = [...elements].filter((el) => !el.closest("[hidden]"));
        if (!visible.length) return;
        const first = visible[0],
          last = visible[visible.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = overflow;
      clearTimeout(timer);
      document.removeEventListener("keydown", key);
      previous.current?.focus();
    };
  }, []);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const resize = () => {
      const sheet = ref.current;
      if (!sheet) return;
      sheet.style.maxHeight = `${Math.max(180, viewport.height - 16)}px`;
      const overlay = sheet.parentElement;
      if (overlay) {
        overlay.style.height = `${viewport.height}px`;
        overlay.style.top = `${viewport.offsetTop}px`;
        overlay.style.bottom = "auto";
      }
    };
    resize();
    viewport.addEventListener("resize", resize);
    viewport.addEventListener("scroll", resize);
    return () => {
      viewport.removeEventListener("resize", resize);
      viewport.removeEventListener("scroll", resize);
    };
  }, []);
  return createPortal(
    <motion.div
      className="sheet-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={requestClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={ref}
        className="sheet glass"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={spring}
        onClick={(e) => e.stopPropagation()}
        onChange={() => setDirty(true)}
      >
        <motion.div
          className="sheet-handle-area"
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={0.1}
          onDragEnd={(_e, info) => {
            if (info.offset.y > 65 || info.velocity.y > 500) requestClose();
          }}
        >
          <div className="sheet-handle" />
        </motion.div>
        <div className="sheet-title">
          <h2 id={titleId}>{title}</h2>
          <IconButton label="Закрити" onClick={requestClose}>
            <X size={20} />
          </IconButton>
        </div>
        {confirm && (
          <div className="discard">
            <h3>Залишити незбережені зміни?</h3>
            <p>Введені дані буде втрачено.</p>
            <Button onClick={() => setConfirm(false)}>Продовжити</Button>
            <Button className="danger ghost" onClick={onClose}>
              Закрити без збереження
            </Button>
          </div>
        )}
        <div hidden={confirm}>{children}</div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
export function Toast() {
  const { notice, setNotice } = useApp();
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(
      () => setNotice(null),
      notice.action ? 6500 : 4500,
    );
    return () => clearTimeout(timer);
  }, [notice, setNotice]);
  return (
    <AnimatePresence>
      {notice && (
        <motion.div
          role="status"
          className={`toast glass ${notice.error ? "error" : ""}`}
          initial={{ opacity: 0, y: -12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8 }}
          transition={soft}
        >
          {notice.error ? <AlertCircle size={17} /> : <Check size={17} />}
          <span>{notice.text}</span>
          {notice.action && (
            <button
              onClick={() => {
                notice.action?.();
                setNotice(null);
              }}
            >
              {notice.label}
            </button>
          )}
          <button
            aria-label="Закрити повідомлення"
            onClick={() => setNotice(null)}
          >
            <X size={15} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function ConfirmDelete({
  onConfirm,
  busy = false,
}: {
  onConfirm: () => void;
  busy?: boolean;
}) {
  const [confirm, setConfirm] = useState(false);
  return confirm ? (
    <div className="confirm-delete">
      <span>Видалити назавжди?</span>
      <Button className="danger" busy={busy} onClick={onConfirm}>
        Так, видалити
      </Button>
      <Button className="ghost" onClick={() => setConfirm(false)}>
        Залишити
      </Button>
    </div>
  ) : (
    <Button className="danger ghost" onClick={() => setConfirm(true)}>
      Видалити
    </Button>
  );
}
