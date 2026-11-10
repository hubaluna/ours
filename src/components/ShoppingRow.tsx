import { useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check } from "lucide-react";
import type { ShoppingItem } from "../lib/types";
import { spring } from "../lib/motion";
import { useApp } from "../hooks/AppContext";
export function ShoppingRow({
  item,
  onEdit,
}: {
  item: ShoppingItem;
  onEdit: () => void;
}) {
  const { update, pending, notify } = useApp();
  const reduced = useReducedMotion();
  const [visual, setVisual] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const locked = useRef(false);
  const purchased = visual ?? item.purchased;
  const busy = saving || pending.includes(item.id);
  return (
    <motion.div
      layout
      layoutId={`shopping-row-${item.id}`}
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
      <button
        className="item-body"
        aria-label={`Редагувати ${item.name}`}
        onClick={onEdit}
      >
        <span className="item-name">{item.name}</span>
        <span className="item-quantity">
          {item.quantity} {item.unit}
        </span>
      </button>
    </motion.div>
  );
}
