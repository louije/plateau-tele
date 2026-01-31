import type { SSEEvent } from "../shared/types.js";

type Client = {
  id: string;
  controller: ReadableStreamDefaultController;
};

const clients: Client[] = [];

export function addClient(
  id: string,
  controller: ReadableStreamDefaultController,
) {
  clients.push({ id, controller });
}

export function removeClient(id: string) {
  const idx = clients.findIndex((c) => c.id === id);
  if (idx !== -1) clients.splice(idx, 1);
}

export function broadcast(event: SSEEvent) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  const encoded = new TextEncoder().encode(data);
  for (const client of clients) {
    try {
      client.controller.enqueue(encoded);
    } catch {
      removeClient(client.id);
    }
  }
}
