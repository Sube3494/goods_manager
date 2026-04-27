import { NextRequest } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import { subscribeAutoPickOrderEvents } from "@/lib/autoPickOrderEvents";

export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

function toSseMessage(event: string, data: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function GET(request: NextRequest) {
  const session = await getAuthorizedUser("order:manage");
  if (!session) {
    return new Response("Permission denied", { status: 403 });
  }

  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(toSseMessage("ready", { ok: true, at: new Date().toISOString() }));

      unsubscribe = subscribeAutoPickOrderEvents(session.id, (payload) => {
        controller.enqueue(toSseMessage("order-update", payload));
      });

      heartbeat = setInterval(() => {
        controller.enqueue(toSseMessage("ping", { at: new Date().toISOString() }));
      }, 15000);

      request.signal.addEventListener("abort", () => {
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
        controller.close();
      });
    },
    cancel() {
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
