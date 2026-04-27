type AutoPickOrderEvent = {
  type: "upsert" | "progress" | "delete";
  userId: string;
  orderId?: string | null;
  orderNo?: string | null;
  platform?: string | null;
  at: string;
};

type Listener = (event: AutoPickOrderEvent) => void;

const scoped = globalThis as typeof globalThis & {
  autoPickOrderEventListeners?: Map<string, Set<Listener>>;
};

function getListenerMap() {
  if (!scoped.autoPickOrderEventListeners) {
    scoped.autoPickOrderEventListeners = new Map<string, Set<Listener>>();
  }

  return scoped.autoPickOrderEventListeners;
}

export function emitAutoPickOrderEvent(event: AutoPickOrderEvent) {
  const listeners = getListenerMap().get(event.userId);
  if (!listeners || listeners.size === 0) {
    return;
  }

  for (const listener of listeners) {
    try {
      listener(event);
    } catch (error) {
      console.error("Failed to dispatch auto-pick order event:", error);
    }
  }
}

export function subscribeAutoPickOrderEvents(userId: string, listener: Listener) {
  const listenerMap = getListenerMap();
  const listeners = listenerMap.get(userId) || new Set<Listener>();
  listeners.add(listener);
  listenerMap.set(userId, listeners);

  return () => {
    const current = listenerMap.get(userId);
    if (!current) {
      return;
    }

    current.delete(listener);
    if (current.size === 0) {
      listenerMap.delete(userId);
    }
  };
}
