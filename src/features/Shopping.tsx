import { useState } from "react";
import { AnimatePresence } from "motion/react";
import { CheckCheck, History, Link2 } from "lucide-react";
import { useApp } from "../hooks/AppContext";
import { categories, type ShoppingItem } from "../lib/types";
import { ShoppingRow } from "../components/ShoppingRow";
import {
  BottomSheet,
  Button,
  EmptyState,
  IconButton,
  Segmented,
} from "../components/ui";
import { ShoppingForm } from "../components/Forms";
import { AddButton, PagedList, ScreenHeader } from "../components/Compact";
import { LinkImport } from "../components/LinkImportLoader";
import { kyivDate, longDate, money } from "../lib/utils";
import { groceryCatalogCategory } from "../lib/grocery-catalog";
export default function Shopping() {
  const { data, archive, repeat, pending, addShoppingBatch } = useApp();
  const [form, setForm] = useState<ShoppingItem | "new" | null>(null),
    [history, setHistory] = useState(false),
    [historySearch, setHistorySearch] = useState(""),
    [historyFrom, setHistoryFrom] = useState(""),
    [historyTo, setHistoryTo] = useState(""),
    [importing, setImporting] = useState(false),
    [view, setView] = useState("active"),
    [category, setCategory] = useState("all");
  const current = data.shopping.filter((i) => !i.session_id),
    active = current.filter((i) => !i.purchased),
    done = current.filter((i) => i.purchased);
  const filtered = (view === "active" ? active : done)
    .map((item) => ({
      item,
      category:
        item.category === "Інше"
          ? groceryCatalogCategory(item.name)
          : item.category,
    }))
    .filter(
      ({ category: itemCategory }) =>
        category === "all" || itemCategory === category,
    )
    .sort((a, b) => {
      const categoryOrder =
        categories.indexOf(a.category as (typeof categories)[number]) -
        categories.indexOf(b.category as (typeof categories)[number]);
      return categoryOrder || 0 || a.item.name.localeCompare(b.item.name, "uk");
    });
  const grouped = categories
    .map((name) => ({
      name,
      items: filtered.filter((entry) => entry.category === name),
    }))
    .filter((group) => group.items.length > 0);
  const total = current.reduce((n, i) => n + (i.price ?? 0), 0);
  const historySessions = [...data.sessions]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .filter((session) => {
      const date = kyivDate(new Date(session.created_at));
      const names = data.shopping
        .filter((item) => item.session_id === session.id)
        .map((item) => item.name)
        .join(" ")
        .toLocaleLowerCase("uk");
      return (
        (!historyFrom || date >= historyFrom) &&
        (!historyTo || date <= historyTo) &&
        (!historySearch ||
          names.includes(historySearch.trim().toLocaleLowerCase("uk")))
      );
    });
  return (
    <section className="screen shopping-screen">
      <ScreenHeader
        title="Покупки"
        subtitle={`${active.length} потрібно купити${total ? ` · ≈ ${money(total)}` : ""}`}
      >
        <IconButton label="Імпорт рецепта" onClick={() => setImporting(true)}>
          <Link2 size={19} />
        </IconButton>
        <AddButton label="Додати товар" onClick={() => setForm("new")} />
      </ScreenHeader>
      <div className="compact-toolbar">
        <Segmented
          id="shopping-view"
          value={view}
          onChange={setView}
          options={[
            { id: "active", label: `Потрібно · ${active.length}` },
            { id: "done", label: `Куплено · ${done.length}` },
          ]}
        />
        <IconButton label="Історія покупок" onClick={() => setHistory(true)}>
          <History size={18} />
        </IconButton>
      </div>
      <div className="filter-line">
        <select
          aria-label="Категорія покупок"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="all">Усі категорії</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        {view === "done" && done.length > 0 && active.length === 0 && (
          <Button
            className="ghost finish-shopping"
            busy={pending.includes("archive")}
            onClick={() => void archive()}
          >
            <CheckCheck size={15} />
            Завершити
          </Button>
        )}
      </div>
      <div className="screen-panel">
        <PagedList
          key={`${view}-${category}`}
          items={grouped}
          render={(group) => (
            <section className="shopping-category-group" key={group.name}>
              <h2 className="shopping-category-heading">{group.name}</h2>
              {group.items.map(({ item }) => (
                <ShoppingRow
                  key={item.id}
                  item={item}
                  onEdit={() => setForm(item)}
                />
              ))}
            </section>
          )}
          empty={
            <EmptyState
              title={
                view === "done"
                  ? "Тут будуть куплені товари"
                  : done.length
                    ? "Усе куплено ✨"
                    : "Список порожній"
              }
              description={
                view === "done"
                  ? "Відмітьте покупку — вона з’явиться тут."
                  : "Додайте товар або інгредієнти з рецепта."
              }
            />
          }
        />
      </div>
      <AnimatePresence mode="wait">
        {form ? (
          <ShoppingForm
            key="shopping-form"
            item={form === "new" ? undefined : form}
            onClose={() => setForm(null)}
          />
        ) : importing ? (
          <LinkImport
            key="recipe-import"
            kind="recipe"
            onClose={() => setImporting(false)}
            onRecipe={addShoppingBatch}
          />
        ) : history ? (
          <BottomSheet
            key="history"
            title="Історія покупок"
            onClose={() => setHistory(false)}
          >
            <div className="history-filters">
              <input
                aria-label="Пошук у покупках"
                placeholder="Знайти товар у покупках"
                value={historySearch}
                onChange={(event) => setHistorySearch(event.target.value)}
              />
              <label>
                Від
                <input
                  aria-label="Покупки від дати"
                  type="date"
                  value={historyFrom}
                  onChange={(event) => setHistoryFrom(event.target.value)}
                />
              </label>
              <label>
                До
                <input
                  aria-label="Покупки до дати"
                  type="date"
                  value={historyTo}
                  onChange={(event) => setHistoryTo(event.target.value)}
                />
              </label>
            </div>
            {historySessions.length ? (
              historySessions.map((s) => (
                <div className="history-card" key={s.id}>
                  <h3>{longDate(kyivDate(new Date(s.created_at)))}</h3>
                  <ul className="history-products">
                    {data.shopping
                      .filter((i) => i.session_id === s.id)
                      .map((item) => (
                        <li key={item.id}>
                          <span>{item.name}</span>
                          <time dateTime={s.created_at}>
                            {new Intl.DateTimeFormat("uk-UA", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                              timeZone: "Europe/Kyiv",
                            }).format(new Date(s.created_at))}
                          </time>
                        </li>
                      ))}
                  </ul>
                  <Button
                    className="secondary"
                    busy={pending.includes(`repeat-${s.id}`)}
                    onClick={() => void repeat(s.id)}
                  >
                    Повторити список
                  </Button>
                </div>
              ))
            ) : (
              <EmptyState
                title="Історія ще попереду"
                description={
                  data.sessions.length
                    ? "За цими фільтрами покупок не знайдено."
                    : "Завершені списки залишатимуться тут."
                }
              />
            )}
          </BottomSheet>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
