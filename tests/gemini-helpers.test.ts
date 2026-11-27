import { describe, expect, it } from "vitest";
import {
  MIN_AI_CATEGORY_CONFIDENCE,
  extractJsonFromGeminiText,
  pickConfidentCategory,
} from "../supabase/functions/_shared/gemini";

describe("Gemini helpers", () => {
  it("extracts JSON from plain and markdown-fenced responses", () => {
    expect(
      extractJsonFromGeminiText('{"category_id":"groceries","confidence":0.92}'),
    ).toEqual({ category_id: "groceries", confidence: 0.92 });

    expect(
      extractJsonFromGeminiText(
        '```json\n{"category_id":"coffee","confidence":0.88}\n```',
      ),
    ).toEqual({ category_id: "coffee", confidence: 0.88 });

    expect(extractJsonFromGeminiText("not json at all")).toBeNull();
  });

  it("only accepts AI category when confidence >= 0.85 and id is allowed", () => {
    const allowed = new Set(["groceries", "coffee", "transport"]);

    expect(MIN_AI_CATEGORY_CONFIDENCE).toBe(0.85);
    expect(
      pickConfidentCategory(
        { category_id: "groceries", confidence: 0.91 },
        allowed,
      ),
    ).toBe("groceries");
    expect(
      pickConfidentCategory(
        { category_id: "groceries", confidence: 0.85 },
        allowed,
      ),
    ).toBe("groceries");
    expect(
      pickConfidentCategory(
        { category_id: "groceries", confidence: 0.84 },
        allowed,
      ),
    ).toBeNull();
    expect(
      pickConfidentCategory(
        { category_id: "unknown_cat", confidence: 0.99 },
        allowed,
      ),
    ).toBeNull();
    expect(
      pickConfidentCategory({ category_id: null, confidence: 0.95 }, allowed),
    ).toBeNull();
  });
});
