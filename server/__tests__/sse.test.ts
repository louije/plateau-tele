import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { addClient, removeClient, broadcast } from "../sse.js";
import type { SSEEvent } from "../../shared/types.js";

describe("SSE module", () => {
  const decoder = new TextDecoder();
  let enqueued: Uint8Array[];
  let controller: ReadableStreamDefaultController;

  beforeEach(() => {
    enqueued = [];
    // Create a real ReadableStream to get a genuine controller
    new ReadableStream({
      start(ctrl) {
        controller = ctrl;
        // Intercept enqueue
        const original = ctrl.enqueue.bind(ctrl);
        ctrl.enqueue = (chunk: Uint8Array) => {
          enqueued.push(chunk);
          // Don't actually enqueue to avoid backpressure issues in tests
        };
      },
    });
  });

  afterEach(() => {
    // Clean up all clients
    removeClient("test-1");
    removeClient("test-2");
  });

  it("broadcasts to connected clients", () => {
    addClient("test-1", controller);

    const event: SSEEvent = {
      type: "item:added",
      item: {
        id: 1,
        tmdbId: 550,
        mediaType: "movie",
        title: "Fight Club",
        posterPath: null,
        year: "1999",
        note: "Great movie",
        addedBy: "Alice",
        position: 0,
        watched: false,
        createdAt: "2024-01-01",
        updatedAt: "2024-01-01",
      },
    };

    broadcast(event);

    expect(enqueued).toHaveLength(1);
    const text = decoder.decode(enqueued[0]);
    expect(text).toMatch(/^data: /);
    expect(text).toMatch(/\n\n$/);

    const parsed = JSON.parse(text.replace("data: ", "").trim());
    expect(parsed.type).toBe("item:added");
    expect(parsed.item.title).toBe("Fight Club");
  });

  it("broadcasts to multiple clients", () => {
    const enqueued2: Uint8Array[] = [];
    let controller2: ReadableStreamDefaultController;

    new ReadableStream({
      start(ctrl) {
        controller2 = ctrl;
        ctrl.enqueue = (chunk: Uint8Array) => {
          enqueued2.push(chunk);
        };
      },
    });

    addClient("test-1", controller);
    addClient("test-2", controller2!);

    broadcast({ type: "item:removed", itemId: 42 });

    expect(enqueued).toHaveLength(1);
    expect(enqueued2).toHaveLength(1);
  });

  it("removes a client by id", () => {
    addClient("test-1", controller);
    removeClient("test-1");

    broadcast({ type: "item:removed", itemId: 1 });
    expect(enqueued).toHaveLength(0);
  });

  it("handles different event types", () => {
    addClient("test-1", controller);

    const events: SSEEvent[] = [
      { type: "item:removed", itemId: 1 },
      {
        type: "item:reordered",
        items: [
          { id: 1, position: 2 },
          { id: 2, position: 1 },
        ],
      },
    ];

    for (const event of events) {
      broadcast(event);
    }

    expect(enqueued).toHaveLength(2);

    const parsed1 = JSON.parse(
      decoder.decode(enqueued[0]).replace("data: ", "").trim(),
    );
    expect(parsed1.type).toBe("item:removed");
    expect(parsed1.itemId).toBe(1);

    const parsed2 = JSON.parse(
      decoder.decode(enqueued[1]).replace("data: ", "").trim(),
    );
    expect(parsed2.type).toBe("item:reordered");
    expect(parsed2.items).toHaveLength(2);
  });
});
