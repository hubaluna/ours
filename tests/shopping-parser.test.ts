import { describe, expect, it } from "vitest";
import {
  capitalizeFirst,
  isBatchShoppingInput,
  parseBatchShoppingInput,
  parseShoppingItemInput,
} from "../src/lib/shopping-parser";

describe("Shopping Parser - Single Item Parsing", () => {
  it("capitalizes the first letter of item names", () => {
    expect(capitalizeFirst("молоко")).toBe("Молоко");
    expect(capitalizeFirst("сир кисломолочний")).toBe("Сир кисломолочний");
    expect(capitalizeFirst("яйця курячі")).toBe("Яйця курячі");
  });

  it("parses item with quantity and unit at the end: яйця 10 шт", () => {
    const item = parseShoppingItemInput("яйця 10 шт");
    expect(item).toEqual({
      name: "Яйця",
      quantity: 10,
      unit: "шт.",
      category: "М’ясо, риба та яйця",
    });
  });

  it("parses item with quantity and unit at the end: сир 200 г", () => {
    const item = parseShoppingItemInput("сир 200 г");
    expect(item).toEqual({
      name: "Сир",
      quantity: 200,
      unit: "г",
      category: "Молочне",
    });
  });

  it("parses item with decimal quantity: молоко 1.5 л", () => {
    const item = parseShoppingItemInput("молоко 1.5 л");
    expect(item).toEqual({
      name: "Молоко",
      quantity: 1.5,
      unit: "л",
      category: "Молочне",
    });
  });

  it("parses item with comma decimal: молоко 1,5 л", () => {
    const item = parseShoppingItemInput("молоко 1,5 л");
    expect(item).toEqual({
      name: "Молоко",
      quantity: 1.5,
      unit: "л",
      category: "Молочне",
    });
  });

  it("parses bare product name with null quantity and default unit: авокадо", () => {
    const item = parseShoppingItemInput("авокадо");
    expect(item).toEqual({
      name: "Авокадо",
      quantity: null,
      unit: "шт.",
      category: "Овочі та фрукти",
    });
  });

  it("handles quantity at the start: 200 г сиру", () => {
    const item = parseShoppingItemInput("200 г сиру");
    expect(item.quantity).toBe(200);
    expect(item.unit).toBe("г");
    expect(item.name).toBe("Сиру");
  });

  it("handles dash separator: банани - 1.5 кг", () => {
    const item = parseShoppingItemInput("банани - 1.5 кг");
    expect(item).toEqual({
      name: "Банани",
      quantity: 1.5,
      unit: "кг",
      category: "Овочі та фрукти",
    });
  });
});

describe("Shopping Parser - Batch Parsing and Detection", () => {
  it("detects and parses multiple items separated by commas", () => {
    const input = "Молоко 1 л, яйця 10 шт, сир 200 г, авокадо";
    expect(isBatchShoppingInput(input)).toBe(true);

    const items = parseBatchShoppingInput(input);
    expect(items).toHaveLength(4);

    expect(items[0]).toEqual({
      name: "Молоко",
      quantity: 1,
      unit: "л",
      category: "Молочне",
    });
    expect(items[1]).toEqual({
      name: "Яйця",
      quantity: 10,
      unit: "шт.",
      category: "М’ясо, риба та яйця",
    });
    expect(items[2]).toEqual({
      name: "Сир",
      quantity: 200,
      unit: "г",
      category: "Молочне",
    });
    expect(items[3]).toEqual({
      name: "Авокадо",
      quantity: null,
      unit: "шт.",
      category: "Овочі та фрукти",
    });
  });

  it("supports items separated by newlines", () => {
    const input = "Хліб 1 уп.\nМасло 180 г\nЯблука 2 кг";
    expect(isBatchShoppingInput(input)).toBe(true);

    const items = parseBatchShoppingInput(input);
    expect(items).toHaveLength(3);
    expect(items[0].name).toBe("Хліб");
    expect(items[0].quantity).toBe(1);
    expect(items[0].unit).toBe("уп.");
    expect(items[1].name).toBe("Масло");
    expect(items[2].name).toBe("Яблука");
  });

  it("supports items separated by semicolons", () => {
    const input = "Сіль 1 уп; Цукор 1 кг";
    expect(isBatchShoppingInput(input)).toBe(true);
    const items = parseBatchShoppingInput(input);
    expect(items).toHaveLength(2);
  });

  it("does not trigger batch input for single item with trailing comma or no delimiters", () => {
    expect(isBatchShoppingInput("молоко")).toBe(false);
    expect(isBatchShoppingInput("молоко, ")).toBe(false);
    expect(isBatchShoppingInput("молоко 1.5 л")).toBe(false);
    expect(isBatchShoppingInput("молоко 1,5 л")).toBe(false);
  });

  it("preserves decimal commas inside comma-separated batch lists", () => {
    const input = "молоко 1,5 л, сир 200 г, авокадо";
    expect(isBatchShoppingInput(input)).toBe(true);
    const items = parseBatchShoppingInput(input);
    expect(items).toHaveLength(3);
    expect(items[0]).toEqual({
      name: "Молоко",
      quantity: 1.5,
      unit: "л",
      category: "Молочне",
    });
    expect(items[1]).toEqual({
      name: "Сир",
      quantity: 200,
      unit: "г",
      category: "Молочне",
    });
    expect(items[2]).toEqual({
      name: "Авокадо",
      quantity: null,
      unit: "шт.",
      category: "Овочі та фрукти",
    });
  });
});
