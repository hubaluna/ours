import { Minus, Plus } from "lucide-react";
import { MAX_SERVINGS } from "../lib/recipe-catalog";
export function PortionCounter({
  value,
  onChange,
  disabled = false,
  label = "Кількість порцій",
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div className="portion-counter" role="group" aria-label={label}>
      <button
        type="button"
        aria-label={`Зменшити порції · ${label}`}
        disabled={disabled || value <= 1}
        onClick={() => onChange(value - 1)}
      >
        <Minus size={15} />
      </button>
      <output aria-live="polite">
        {value}
        <small>порц.</small>
      </output>
      <button
        type="button"
        aria-label={`Збільшити порції · ${label}`}
        disabled={disabled || value >= MAX_SERVINGS}
        onClick={() => onChange(value + 1)}
      >
        <Plus size={15} />
      </button>
    </div>
  );
}
