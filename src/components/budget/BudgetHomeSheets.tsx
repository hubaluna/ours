import { useEffect, useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { useApp } from "../../hooks/AppContext";
import {
  findCategoryMeta,
  formatBudgetDayHeading,
  formatUAH,
  parseApplePayAmount,
  resolveBudgetCategories,
  suggestRulePattern,
} from "../../lib/budget";
import type { BudgetRecurringPayment, BudgetTransaction } from "../../lib/types";
import { BottomSheet, Button, Field } from "../ui";

export function BudgetRecurringConfirmSheet({
  item,
  customCategories,
  busy,
  onClose,
  onConfirm,
  onSkip,
}: {
  item: BudgetRecurringPayment;
  customCategories: ReturnType<typeof useApp>["data"]["budgetCategories"];
  busy: boolean;
  onClose: () => void;
  onConfirm: (amount: number) => Promise<void>;
  onSkip: () => Promise<void>;
}) {
  const [amountText, setAmountText] = useState(String(item.amount));
  const meta = findCategoryMeta(item.category_key, customCategories, item.kind);

  useEffect(() => {
    setAmountText(String(item.amount));
  }, [item.id, item.amount]);

  const parsed = parseApplePayAmount(amountText);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!parsed || parsed <= 0) return;
    await onConfirm(parsed);
  };

  return (
    <BottomSheet title="Регулярний платіж" onClose={onClose}>
      <form className="budget-review-modal" onSubmit={handleSubmit}>
        <div className="budget-review-hero">
          <span className="budget-review-merchant">
            {meta.emoji} {item.title}
          </span>
          <strong className="budget-review-amount">
            {formatUAH(parsed ?? item.amount)}
          </strong>
          <small>
            Щомісяця {item.day_of_month}-го · {meta.name} ·{" "}
            {item.kind === "income" ? "Дохід" : "Витрата"}
          </small>
        </div>

        <Field label="Сума цього місяця (₴)">
          <input
            type="text"
            inputMode="decimal"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            placeholder="0"
            required
          />
        </Field>

        <div className="budget-recurring-confirm-footer">
          <Button type="submit" busy={busy} disabled={!parsed || parsed <= 0}>
            Внести операцію
          </Button>
          <Button
            type="button"
            className="secondary"
            busy={busy}
            onClick={() => void onSkip()}
          >
            Пропустити цього місяця
          </Button>
        </div>
      </form>
    </BottomSheet>
  );
}

export function BudgetReviewSheet({
  tx,
  categories,
  busy,
  onClose,
  onCategorize,
  onEditFull,
  onDelete,
}: {
  tx: BudgetTransaction;
  categories: ReturnType<typeof resolveBudgetCategories>;
  busy: boolean;
  onClose: () => void;
  onCategorize: (
    categoryKey: string,
    saveRule: boolean,
    rulePattern: string,
  ) => Promise<void>;
  onEditFull?: () => void;
  onDelete?: () => Promise<void>;
}) {
  const [saveRule, setSaveRule] = useState(true);
  const [pattern, setPattern] = useState(() =>
    suggestRulePattern(tx.merchant || ""),
  );

  useEffect(() => {
    setPattern(suggestRulePattern(tx.merchant || ""));
    setSaveRule(true);
  }, [tx.id, tx.merchant]);

  return (
    <BottomSheet title="Оберіть категорію" onClose={onClose}>
      <div className="budget-review-modal">
        <div className="budget-review-hero">
          <div className="budget-review-amount">{formatUAH(tx.amount)}</div>
          <div className="budget-review-merchant">
            {tx.merchant || "Оплата Apple Pay"}
          </div>
          <small>
            {formatBudgetDayHeading(tx.occurred_on)}
            {tx.card_label ? ` · ${tx.card_label}` : ""}
          </small>
        </div>

        <label className="budget-rule-remember">
          <input
            type="checkbox"
            checked={saveRule}
            onChange={(e) => setSaveRule(e.target.checked)}
          />
          <span>Запам’ятати продавця для автовибору</span>
        </label>

        {saveRule && (
          <Field label="Шаблон продавця для правила">
            <input
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              maxLength={120}
              placeholder="Напр.: FOP IVANOV"
            />
          </Field>
        )}

        <div className="budget-cat-grid">
          {categories.map((cat) => (
            <button
              key={cat.key}
              type="button"
              disabled={busy}
              className="budget-cat-tile"
              onClick={() => void onCategorize(cat.key, saveRule, pattern)}
            >
              <span
                className="budget-cat-tile-dot"
                style={{ backgroundColor: cat.color }}
                aria-hidden="true"
              />
              <span className="budget-cat-tile-emoji">{cat.emoji}</span>
              <span>{cat.name}</span>
            </button>
          ))}
        </div>

        {(onEditFull || onDelete) && (
          <div className="budget-review-footer">
            {onEditFull && (
              <Button type="button" className="ghost" onClick={onEditFull}>
                Змінити деталі
              </Button>
            )}
            {onDelete && (
              <Button
                type="button"
                className="danger ghost"
                onClick={() => void onDelete()}
              >
                <Trash2 size={15} />
                Видалити
              </Button>
            )}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
