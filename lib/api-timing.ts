type ApiTimingInput = {
  route: string;
  start: number;
  status: number;
  role?: string | null;
  success?: boolean;
};

export function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function logApiTiming({ route, start, status, role, success }: ApiTimingInput) {
  const durationMs = Math.round(nowMs() - start);
  const ok = success ?? status < 400;
  console.info(
    JSON.stringify({
      event: "api_timing",
      route,
      durationMs,
      status,
      role: role ?? "anonymous",
      success: ok
    })
  );
}

export function withApiTiming<T extends Response>(response: T, input: Omit<ApiTimingInput, "status">) {
  logApiTiming({ ...input, status: response.status });
  return response;
}
