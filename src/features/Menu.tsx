import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Fish, Salad, Shuffle, Wheat } from "lucide-react";
import { useApp } from "../hooks/AppContext";
import { firstMenu, nextMenu, type MenuSuggestion } from "../lib/menu";
import { Button } from "../components/ui";
import { ScreenHeader } from "../components/Compact";
import { soft } from "../lib/motion";
export default function Menu() {
  const { userId } = useApp();
  const [suggestion, setSuggestion] = useState<MenuSuggestion>(() => {
    try {
      const value = JSON.parse(
        localStorage.getItem(`ours-menu-${userId}`) || "null",
      );
      if (
        value &&
        Object.values(value).length === 3 &&
        ["side", "protein", "salad"].every(
          (k) => typeof value[k] === "string" && value[k].length < 160,
        )
      )
        return value;
    } catch {
      /* a fresh idea is always available */
    }
    return firstMenu;
  });
  useEffect(() => {
    try {
      localStorage.setItem(`ours-menu-${userId}`, JSON.stringify(suggestion));
    } catch {
      /* local ideas do not block the app */
    }
  }, [suggestion, userId]);
  return (
    <section className="screen menu-screen">
      <ScreenHeader title="Меню" subtitle="Одна хороша ідея для вечері" />
      <div className="menu-content">
        <div className="menu-grid">
          {(
            [
              { key: "side", label: "Гарнір", Icon: Wheat },
              { key: "protein", label: "М’ясо або риба", Icon: Fish },
              { key: "salad", label: "Салат", Icon: Salad },
            ] as const
          ).map(({ key, label, Icon }) => (
            <article className="menu-course card" key={key}>
              <span className="course-icon">
                <Icon size={21} />
              </span>
              <div>
                <span className="row-kicker">{label}</span>
                <motion.h2
                  key={suggestion[key]}
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={soft}
                >
                  {suggestion[key]}
                </motion.h2>
              </div>
            </article>
          ))}
        </div>
        <div className="menu-footer">
          <Button
            onClick={() => setSuggestion((previous) => nextMenu(previous))}
          >
            <Shuffle size={17} />
            Згенерувати вечерю
          </Button>
          <p>
            Початковий набір ідей.
            <br />
            Власне меню наповнимо згодом.
          </p>
        </div>
      </div>
    </section>
  );
}
