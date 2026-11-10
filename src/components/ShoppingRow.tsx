import { useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, MoreHorizontal } from "lucide-react";
import type { ShoppingItem } from "../lib/types";
import { spring } from "../lib/motion";
import { useApp } from "../hooks/AppContext";
import { money } from "../lib/utils";
export function ShoppingRow({
  item,
  compact = false,
  onEdit,
}: {
  item: ShoppingItem;
  compact?: boolean;
  onEdit?: () => void;
}) {
  const { update, pending, data, notify } = useApp();
  const reduced = useReducedMotion();
  const [visual, setVisual] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const locked = useRef(false);
  const purchased = visual ?? item.purchased;
  const busy = saving || pending.includes(item.id);
  return (
    <motion.div
      layout
      layoutId={`shopping-row-${compact ? "compact" : "full"}-${item.id}`}
      aria-busy={busy}
      transition={spring}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className={`shopping-row ${purchased ? "purchased" : ""} ${busy ? "pending" : ""}`}
    >
      <motion.button
        whileTap={{ scale: 0.94 }}
        className="check-button"
        role="checkbox"
        aria-checked={purchased}
        aria-label={`${purchased ? "Повернути" : "Куплено"}: ${item.name}`}
        disabled={busy}
        onClick={async () => {
          if (locked.current) return;
          locked.current = true;
          setSaving(true);
          setVisual(!item.purchased);
          // A short, pending visual beat lets the check resolve before relocation.
          if (!reduced)
            await new Promise((resolve) => setTimeout(resolve, 180));
          const ok = await update("shopping_items", item.id, {
            purchased: !item.purchased,
          });
          setVisual(null);
          setSaving(false);
          locked.current = false;
          if (ok)
            notify(
              item.purchased ? "Повернуто до списку" : "Куплено",
              () =>
                void update("shopping_items", item.id, {
                  purchased: item.purchased,
                }),
            );
        }}
      >
        {purchased && (
          <motion.span
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            <Check size={15} strokeWidth={2.5} />
          </motion.span>
        )}
      </motion.button>
      <button className="item-body" onClick={onEdit} disabled={!onEdit}>
        <span className="item-name">{item.name}</span>
        {!compact && (
          <span className="item-meta">
            {data.profiles.find((p) => p.id === item.added_by)?.name ?? "Ми"}
            {item.price !== null ? ` · ${money(item.price)}` : ""}
          </span>
        )}
      </button>
      <span className="item-quantity">
        {item.quantity} {item.unit}
      </span>
      {onEdit && (
        <button
          className="row-more"
          aria-label={`Редагувати ${item.name}`}
          onClick={onEdit}
        >
          <MoreHorizontal size={18} />
        </button>
      )}
    </motion.div>
  );
}
