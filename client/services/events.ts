import type { SSEEvent } from "../../shared/types.js";

type Listener = (event: SSEEvent) => void;

const listeners = new Set<Listener>();

let source: EventSource | null = null;

export function connect() {
  if (source) return;

  source = new EventSource("/api/events");

  source.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data) as SSEEvent;
      for (const fn of listeners) fn(event);
    } catch {
      // ignore malformed messages
    }
  };

  source.onerror = () => {
    // EventSource auto-reconnects; nothing to do
  };
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
