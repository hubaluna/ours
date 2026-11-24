import { useState } from "react";
import { AnimatePresence } from "motion/react";
import { CheckCheck, ChevronDown, History, Link2, SlidersHorizontal } from "lucide-react";
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
import { addDays } from "../lib/plant-care";
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
  const resolveCategory = (item: ShoppingItem) =>
    item.category === "Інше"
      ? groceryCatalogCategory(item.name)
      : item.category;
  const purchasedAtById = new Map<string, string>();
  for (const activity of data.activities) {
    if (
      activity.kind === "shopping" &&
      activity.action === "purchased" &&
      activity.entity_id &&
      !purchasedAtById.has(activity.entity_id)
    ) {
      purchasedAtById.set(activity.entity_id, activity.created_at);
    }
  }
  const safeKyivDate = (raw?: string | null) => {
    const ms = raw ? Date.parse(raw) : NaN;
    return kyivDate(Number.isFinite(ms) ? new Date(ms) : new Date());
  };
  const purchaseDateKey = (item: ShoppingItem) =>
    safeKyivDate(
      item.updated_at || purchasedAtById.get(item.id) || item.created_at,
    );
  const today = kyivDate();
  const yesterday = addDays(today, -1);
  const formatDateHeading = (date: string) => {
    const shortDay = new Intl.DateTimeFormat("uk-UA", {
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }).format(new Date(`${date}T12:00:00Z`));
    if (date === today) return `Сьогодні · ${shortDay}`;
    if (date === yesterday) return `Вчора · ${shortDay}`;
    return longDate(date);
  };
  const filteredActive = active
    .map((item) => ({ item, category: resolveCategory(item) }))
    .filter(
      ({ category: itemCategory }) =>
        category === "all" || itemCategory === category,
    )
    .sort((a, b) => {
      const categoryOrder =
        categories.indexOf(a.category as (typeof categories)[number]) -
        categories.indexOf(b.category as (typeof categories)[number]);
      return categoryOrder || a.item.name.localeCompare(b.item.name, "uk");
    });
  const groupedActive = categories
    .map((name) => ({
      name,
      items: filteredActive.filter((entry) => entry.category === name),
    }))
    .filter((group) => group.items.length > 0);
  const filteredDone = done
    .map((item) => ({
      item,
      category: resolveCategory(item),
      date: purchaseDateKey(item),
    }))
    .filter(
      ({ category: itemCategory }) =>
        category === "all" || itemCategory === category,
    );
  const doneDates = [...new Set(filteredDone.map((entry) => entry.date))].sort(
    (a, b) => b.localeCompare(a),
  );
  const groupedDone = doneDates.map((date) => {
    const entries = filteredDone.filter((entry) => entry.date === date);
    const byCategory = categories
      .map((name) => ({
        name,
        items: entries
          .filter((entry) => entry.category === name)
          .sort((a, b) => a.item.name.localeCompare(b.item.name, "uk")),
      }))
      .filter((group) => group.items.length > 0);
    return {
      date,
      label: formatDateHeading(date),
      categories: byCategory,
    };
  });
  const total = current.reduce((n, i) => n + (i.price ?? 0), 0);
  const historySessions = [...data.sessions]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .filter((session) => {
      const date = safeKyivDate(session.created_at);
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
      <div className="filter-line shopping-filter-line">
        <label
          className={`shopping-category-filter${category !== "all" ? " is-active" : ""}`}
        >
          <SlidersHorizontal size={13} className="shopping-category-icon" />
          <select
            aria-label="Категорія покупок"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="shopping-category-select"
          >
            <option value="all">Усі категорії</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <ChevronDown size={13} className="shopping-category-chevron" />
        </label>
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
        {view === "active" ? (
          <PagedList
            key={`active-${category}`}
            items={groupedActive}
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
                title={done.length ? "Усе куплено ✨" : "Список порожній"}
                description="Додайте товар або інгредієнти з рецепта."
              />
            }
          />
        ) : (
          <PagedList
            key={`done-${category}`}
            items={groupedDone}
            render={(dateGroup) => (
              <section className="shopping-date-group" key={dateGroup.date}>
                <h2 className="shopping-date-heading">{dateGroup.label}</h2>
                {dateGroup.categories.map((group) => (
                  <div className="shopping-category-group" key={group.name}>
                    <h3 className="shopping-category-heading">{group.name}</h3>
                    {group.items.map(({ item }) => (
                      <ShoppingRow
                        key={item.id}
                        item={item}
                        onEdit={() => setForm(item)}
                      />
                    ))}
                  </div>
                ))}
              </section>
            )}
            empty={
              <EmptyState
                title="Тут будуть куплені товари"
                description="Відмітьте покупку — вона з’явиться тут."
              />
            }
          />
        )}
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
              historySessions.map((s) => {
                const sessionItems = data.shopping.filter(
                  (i) => i.session_id === s.id,
                );
                const sessionGroups = categories
                  .map((name) => ({
                    name,
                    items: sessionItems
                      .filter((i) => resolveCategory(i) === name)
                      .sort((a, b) => a.name.localeCompare(b.name, "uk")),
                  }))
                  .filter((g) => g.items.length > 0);
                return (
                  <div className="history-card" key={s.id}>
                    <h3>{longDate(kyivDate(new Date(s.created_at)))}</h3>
                    {sessionGroups.map((group) => (
                      <div className="history-category-group" key={group.name}>
                        <h4 className="history-category-heading">
                          {group.name}
                        </h4>
                        <ul className="history-products">
                          {group.items.map((item) => (
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
                      </div>
                    ))}
                    <Button
                      className="secondary"
                      busy={pending.includes(`repeat-${s.id}`)}
                      onClick={() => void repeat(s.id)}
                    >
                      Повторити список
                    </Button>
                  </div>
                );
              })
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
