import { Hono } from "hono";
import { addClient, removeClient } from "../sse.js";

const events = new Hono();

// GET /api/events — SSE stream
events.get("/", (c) => {
  const clientId = crypto.randomUUID();

  const stream = new ReadableStream({
    start(controller) {
      addClient(clientId, controller);
      // Send a keepalive comment immediately
      controller.enqueue(new TextEncoder().encode(": connected\n\n"));
    },
    cancel() {
      removeClient(clientId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});

export { events };
