import { useState, type FormEvent } from "react";
import { Check, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useApp } from "../hooks/AppContext";
import {
  ALWAYS_AT_HOME_LABELS,
  BASIC_PANTRY_STAPLES,
  normalizePantryName,
} from "../lib/pantry";
import type { PantryItem } from "../lib/types";
import { BottomSheet, Button, IconButton } from "./ui";

export function PantrySheet({ onClose }: { onClose: () => void }) {
  const {
    data,
    addPantryItem,
    updatePantryItem,
    removePantryItem,
    toggleBasicPantryItem,
    pending,
  } = useApp();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editQuantity, setEditQuantity] = useState("");
  const busy = pending.includes("pantry");

  const activeBasicNorms = new Set(
    data.pantry.map((item) => item.normalized_name),
  );

  const normalizedQuery = normalizePantryName(search);
  const items = [...data.pantry]
    .filter((item) =>
      !normalizedQuery ? true : item.normalized_name.includes(normalizedQuery),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "uk"));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) return;
    const ok = await addPantryItem({
      name: name.trim(),
      quantity: quantity.trim(),
      is_basic: false,
    });
    if (ok) {
      setName("");
      setQuantity("");
    }
  };

  const startEdit = (item: PantryItem) => {
    setEditing(item.id);
    setEditName(item.name);
    setEditQuantity(item.quantity);
  };

  const saveEdit = async (id: string) => {
    if (!editName.trim()) return;
    const ok = await updatePantryItem(id, {
      name: editName.trim(),
      quantity: editQuantity.trim(),
    });
    if (ok) setEditing(null);
  };

  return (
    <BottomSheet
      title="єВдома"
      onClose={onClose}
      wide
      guardChanges={false}
    >
      <div className="pantry-sheet">
        <p className="pantry-lead">
          Позначайте продукти, які вже є на кухні — рецепти та список покупок
          врахують їх автоматично.
        </p>

        <form className="pantry-add-form" onSubmit={(e) => void submit(e)}>
          <div className="pantry-add-inputs">
            <input
              aria-label="Назва продукту вдома"
              placeholder="Додати продукт (напр. молоко, куряче філе)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              disabled={busy}
            />
            <input
              aria-label="Кількість або примітка"
              placeholder="Кількість (необов’язково)"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              maxLength={60}
              disabled={busy}
            />
          </div>
          <Button
            type="submit"
            busy={busy}
            disabled={!name.trim() || busy}
          >
            <Plus size={16} />
            Додати
          </Button>
        </form>

        <section className="pantry-section" aria-label="Базові продукти">
          <div className="pantry-section-head">
            <h3>Базові продукти · одним кліком</h3>
          </div>
          <div className="pantry-staples-grid">
            {BASIC_PANTRY_STAPLES.map((staple) => {
              const norm = normalizePantryName(staple.name);
              const active = activeBasicNorms.has(norm);
              return (
                <button
                  key={staple.name}
                  type="button"
                  className={`pantry-staple-btn${active ? " active" : ""}`}
                  aria-pressed={active}
                  disabled={busy}
                  onClick={() => void toggleBasicPantryItem(staple.name)}
                >
                  <span className="pantry-staple-check" aria-hidden="true">
                    {active && <Check size={13} strokeWidth={2.5} />}
                  </span>
                  <span className="pantry-staple-copy">
                    <strong>{staple.name}</strong>
                    <small>{staple.hint}</small>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="subtle-note pantry-always-note">
            Постійно враховуються вдома: {ALWAYS_AT_HOME_LABELS.join(", ")}.
          </p>
        </section>

        <section className="pantry-section" aria-label="Запаси вдома">
          <div className="pantry-section-head">
            <h3>
              У запасах <span className="count">{data.pantry.length}</span>
            </h3>
            {data.pantry.length > 4 && (
              <label className="pantry-search">
                <Search size={14} aria-hidden="true" />
                <input
                  aria-label="Пошук у запасах"
                  placeholder="Пошук…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
            )}
          </div>

          {items.length ? (
            <ul className="pantry-items-list">
              {items.map((item) => (
                <li className="pantry-item-row" key={item.id}>
                  {editing === item.id ? (
                    <div className="pantry-item-edit">
                      <input
                        aria-label={`Редагувати назву: ${item.name}`}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        maxLength={120}
                      />
                      <input
                        aria-label={`Редагувати кількість: ${item.name}`}
                        placeholder="Кількість"
                        value={editQuantity}
                        onChange={(e) => setEditQuantity(e.target.value)}
                        maxLength={60}
                      />
                      <IconButton
                        label={`Зберегти ${item.name}`}
                        disabled={busy || !editName.trim()}
                        onClick={() => void saveEdit(item.id)}
                      >
                        <Check size={16} />
                      </IconButton>
                      <IconButton
                        label="Скасувати редагування"
                        onClick={() => setEditing(null)}
                      >
                        <X size={16} />
                      </IconButton>
                    </div>
                  ) : (
                    <>
                      <div className="pantry-item-copy">
                        <strong>{item.name}</strong>
                        {(item.quantity || item.is_basic) && (
                          <small>
                            {[
                              item.quantity,
                              item.is_basic ? "базовий продукт" : "",
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </small>
                        )}
                      </div>
                      <div className="pantry-item-actions">
                        <IconButton
                          label={`Редагувати ${item.name}`}
                          disabled={busy}
                          onClick={() => startEdit(item)}
                        >
                          <Pencil size={15} />
                        </IconButton>
                        <IconButton
                          label={`Видалити ${item.name}`}
                          disabled={busy}
                          onClick={() => void removePantryItem(item.id)}
                        >
                          <Trash2 size={15} />
                        </IconButton>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="pantry-empty">
              {data.pantry.length
                ? "За цим запитом нічого не знайдено."
                : "Список поки порожній. Оберіть базові продукти вище або додайте свої."}
            </p>
          )}
        </section>
      </div>
    </BottomSheet>
  );
}
