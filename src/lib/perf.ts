export type PerfTracker = {
  enabled: boolean;
  lap: (name: string) => void;
  headers: () => Record<string, string>;
  log: (label: string, extra?: Record<string, unknown>) => void;
};

function sanitizeMetricName(name: string) {
  return String(name || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "step";
}

export function createRequestPerfTracker(request: Request): PerfTracker {
  const url = new URL(request.url);
  const enabled = url.searchParams.get("_timing") === "1" || process.env.DEBUG_API_TIMING === "1";
  const startedAt = performance.now();
  let lastAt = startedAt;
  const steps: Array<{ name: string; duration: number }> = [];

  return {
    enabled,
    lap(name: string) {
      if (!enabled) {
        return;
      }
      const now = performance.now();
      steps.push({
        name: sanitizeMetricName(name),
        duration: Math.round((now - lastAt) * 100) / 100,
      });
      lastAt = now;
    },
    headers() {
      if (!enabled) {
        return {} as Record<string, string>;
      }
      const total = Math.round((performance.now() - startedAt) * 100) / 100;
      return {
        "Server-Timing": [
          ...steps.map((step) => `${step.name};dur=${step.duration}`),
          `total;dur=${total}`,
        ].join(", "),
        "X-Response-Time-ms": String(total),
      };
    },
    log(label: string, extra?: Record<string, unknown>) {
      if (!enabled) {
        return;
      }
      const total = Math.round((performance.now() - startedAt) * 100) / 100;
      console.info(`[perf] ${label}`, {
        totalMs: total,
        steps,
        ...(extra || {}),
      });
    },
  };
}
