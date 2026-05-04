export interface SyncTransport {
  subscribe: (onTick: () => void) => () => void;
}

export function createPollingTransport(intervalMs: number): SyncTransport {
  return {
    subscribe(onTick) {
      const id = setInterval(onTick, intervalMs);
      return () => clearInterval(id);
    },
  };
}
