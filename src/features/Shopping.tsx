import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCheck, History, Layers3, Plus, ShoppingBag } from "lucide-react";
import { useApp } from "../hooks/AppContext";
import { categories, type ShoppingItem } from "../lib/types";
import { ShoppingRow } from "../components/ShoppingRow";
import { BottomSheet, Button, EmptyState, Segmented } from "../components/ui";
import { ShoppingForm } from "../components/Forms";
import { longDate, money } from "../lib/utils";
export default function Shopping() {
  const { data, archive, repeat, pending } = useApp();
  const [form, setForm] = useState<ShoppingItem | "new" | null>(null),
    [history, setHistory] = useState(false),
    [group, setGroup] = useState(false);
  const current = data.shopping.filter((i) => !i.session_id),
    active = current.filter((i) => !i.purchased),
    done = current.filter((i) => i.purchased);
  const total = current.reduce((sum, i) => sum + (i.price ?? 0), 0);
  return (
    <>
      <div className="page-intro">
        <div className="eyebrow">МЕНШЕ ТРИМАТИ В ГОЛОВІ</div>
        <h1>
          Що купуємо
          <br className="mobile-break" /> сьогодні?
        </h1>
        <p>Один список. На двох. Без «а ти купив?»</p>
      </div>
      <div className="toolbar">
        <Segmented
          id="shopping-view"
          value={group ? "group" : "list"}
          onChange={(v) => setGroup(v === "group")}
          options={[
            { id: "list", label: "Усі товари" },
            { id: "group", label: "За категоріями" },
          ]}
        />
        <Button
          className="ghost history-button"
          onClick={() => setHistory(true)}
        >
          <History size={18} />
          <span>Історія</span>
        </Button>
      </div>
      <div className="list-summary">
        <span>
          <ShoppingBag size={15} />
          {active.length} у списку{total > 0 ? ` · ≈ ${money(total)}` : ""}
        </span>
        <span>ваші щоденні дрібниці</span>
      </div>
      {active.length === 0 && current.length === 0 ? (
        <div className="card">
          <EmptyState
            title="Список порожній"
            description="Додайте щось потрібне — і звільніть місце для важливішого."
          >
            <Button className="ghost" onClick={() => setForm("new")}>
              <Plus size={17} />
              Додати перший товар
            </Button>
          </EmptyState>
        </div>
      ) : active.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="completed card"
        >
          <span>
            <CheckCheck size={30} />
          </span>
          <h2>Усе куплено ✨</h2>
          <p>Ще одна маленька справа зроблена разом.</p>
        </motion.div>
      ) : group ? (
        <>
          {categories.map((c) => {
            const items = active.filter((i) => i.category === c);
            return (
              items.length > 0 && (
                <section key={c} className="shopping-category">
                  <h3>
                    <Layers3 size={14} />
                    {c}
                    <span>{items.length}</span>
                  </h3>
                  <div className="card shopping-list">
                    <AnimatePresence initial={false}>
                      {items.map((i) => (
                        <ShoppingRow
                          key={i.id}
                          item={i}
                          onEdit={() => setForm(i)}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                </section>
              )
            );
          })}
        </>
      ) : (
        <div className="card shopping-list">
          <AnimatePresence initial={false}>
            {active.map((i) => (
              <ShoppingRow key={i.id} item={i} onEdit={() => setForm(i)} />
            ))}
          </AnimatePresence>
        </div>
      )}
      {done.length > 0 && (
        <section className="purchased-section">
          <div className="section-heading">
            <h2>
              Куплено <span className="count">{done.length}</span>
            </h2>
            {active.length === 0 && (
              <Button
                className="ghost"
                busy={pending.includes("archive")}
                onClick={() => void archive()}
              >
                Завершити покупки <CheckCheck size={16} />
              </Button>
            )}
          </div>
          <div className="card shopping-list">
            <AnimatePresence initial={false}>
              {done.map((i) => (
                <ShoppingRow key={i.id} item={i} onEdit={() => setForm(i)} />
              ))}
            </AnimatePresence>
          </div>
          {active.length > 0 && (
            <p className="subtle-note">
              Завершення покупок стане доступним, коли все буде куплено.
            </p>
          )}
        </section>
      )}
      <Button className="floating-add" onClick={() => setForm("new")}>
        <Plus size={21} />
        Додати товар
      </Button>
      <AnimatePresence>
        {form && (
          <ShoppingForm
            item={form === "new" ? undefined : form}
            onClose={() => setForm(null)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {history && (
          <BottomSheet title="Наші покупки" onClose={() => setHistory(false)}>
            {data.sessions.length === 0 ? (
              <EmptyState
                title="Історія ще попереду"
                description="Завершені покупки зберігатимуться тут."
              />
            ) : (
              data.sessions.map((s) => (
                <div className="history-card" key={s.id}>
                  <h3>{longDate(s.created_at.slice(0, 10))}</h3>
                  <p>
                    {data.shopping
                      .filter((i) => i.session_id === s.id)
                      .map((i) => i.name)
                      .join(", ")}
                  </p>
                  <Button
                    className="ghost"
                    busy={pending.includes(`repeat-${s.id}`)}
                    onClick={() => void repeat(s.id)}
                  >
                    Повторити список <Plus size={16} />
                  </Button>
                </div>
              ))
            )}
          </BottomSheet>
        )}
      </AnimatePresence>
    </>
  );
}
