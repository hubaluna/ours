// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import {
  enqueueOfflineMutation,
  readOfflineMutationQueue,
  writeOfflineMutationQueue,
  type OfflineMutation,
} from "../src/lib/offline-mutation-queue";

describe("offline-mutation-queue", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("coalesces insert and update into updated insert", () => {
    let q: OfflineMutation[] = [];
    q = enqueueOfflineMutation(q, {
      id: "mut-1",
      table: "wishes",
      op: "insert",
      entityId: "wish-1",
      payload: { name: "Книга", price: 300 },
      queuedAt: "2026-11-23T20:00:00Z",
    });
    expect(q).toHaveLength(1);

    q = enqueueOfflineMutation(q, {
      id: "mut-2",
      table: "wishes",
      op: "update",
      entityId: "wish-1",
      payload: { price: 350, note: "У твердій обкладинці" },
      queuedAt: "2026-11-23T20:01:00Z",
    });
    expect(q).toHaveLength(1);
    expect(q[0].op).toBe("insert");
    expect(q[0].payload).toEqual({
      name: "Книга",
      price: 350,
      note: "У твердій обкладинці",
    });
  });

  it("coalesces insert and delete into empty queue", () => {
    let q: OfflineMutation[] = [];
    q = enqueueOfflineMutation(q, {
      id: "mut-1",
      table: "events",
      op: "insert",
      entityId: "event-1",
      payload: { title: "Вечеря" },
      queuedAt: "2026-11-23T20:00:00Z",
    });
    expect(q).toHaveLength(1);

    q = enqueueOfflineMutation(q, {
      id: "mut-2",
      table: "events",
      op: "delete",
      entityId: "event-1",
      queuedAt: "2026-11-23T20:02:00Z",
    });
    expect(q).toHaveLength(0);
  });

  it("coalesces multiple updates to existing entity", () => {
    let q: OfflineMutation[] = [];
    q = enqueueOfflineMutation(q, {
      id: "mut-1",
      table: "plants",
      op: "update",
      entityId: "plant-1",
      payload: { last_watered_at: "2026-11-23" },
      queuedAt: "2026-11-23T20:00:00Z",
    });
    q = enqueueOfflineMutation(q, {
      id: "mut-2",
      table: "plants",
      op: "update",
      entityId: "plant-1",
      payload: { light: "Півтінь" },
      queuedAt: "2026-11-23T20:05:00Z",
    });
    expect(q).toHaveLength(1);
    expect(q[0].payload).toEqual({
      last_watered_at: "2026-11-23",
      light: "Півтінь",
    });
  });

  it("reads and writes queue to localStorage safely", () => {
    const q: OfflineMutation[] = [
      {
        id: "mut-1",
        table: "movies",
        op: "insert",
        entityId: "movie-1",
        payload: { title: "Інтерстеллар" },
        queuedAt: "2026-11-23T20:00:00Z",
      },
    ];
    writeOfflineMutationQueue("user-test", q);
    expect(readOfflineMutationQueue("user-test")).toEqual(q);
    expect(readOfflineMutationQueue("other-user")).toEqual([]);

    writeOfflineMutationQueue("user-test", []);
    expect(readOfflineMutationQueue("user-test")).toEqual([]);
  });
});
