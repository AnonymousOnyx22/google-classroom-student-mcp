import { ApiError, describeStatus } from "./core/http.js";
import type { TokenProvider } from "./auth.js";

export interface ClassroomApi {
  get<T = any>(path: string, query?: Record<string, string | undefined>): Promise<T>;
  /** Follows nextPageToken and concatenates `key` arrays from each page. */
  list<T = any>(path: string, key: string, query?: Record<string, string | undefined>, maxPages?: number): Promise<T[]>;
}

export function createClassroomApi(
  token: TokenProvider,
  baseUrl = "https://classroom.googleapis.com",
  fetchImpl: typeof fetch = fetch,
  retry: { retries?: number; baseDelayMs?: number } = {},
): ClassroomApi {
  const retries = retry.retries ?? 3;
  const baseDelay = retry.baseDelayMs ?? 1000;
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // 429, 5xx and Google's 403 rate limit replies are worth another try. Other 403s mean no access.
  function retryable(status: number, body: string): boolean {
    if (status === 429 || status >= 500) return true;
    return status === 403 && /rateLimitExceeded|userRateLimitExceeded|RESOURCE_EXHAUSTED/.test(body);
  }

  async function request(path: string, query: Record<string, string | undefined> = {}): Promise<any> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await requestOnce(path, query);
      } catch (err) {
        if (!(err instanceof ApiError) || attempt >= retries || !retryable(err.status, err.body ?? "")) throw err;
        const backoff = baseDelay * 2 ** attempt;
        await wait(Math.min(Math.max(backoff, err.retryAfterMs ?? 0), 30000) + Math.random() * baseDelay * 0.25);
      }
    }
  }

  async function requestOnce(path: string, query: Record<string, string | undefined>): Promise<any> {
    const url = new URL(baseUrl.replace(/\/+$/, "") + "/" + path.replace(/^\/+/, ""));
    for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, v);
    let res: Response;
    try {
      res = await fetchImpl(url.toString(), {
        headers: { Authorization: `Bearer ${await token()}`, Accept: "application/json" },
        signal: AbortSignal.timeout(20000),
      });
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(`Network error: ${(err as Error).message}`, 0);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const err = new ApiError(describeStatus(res.status), res.status, body.slice(0, 500));
      const seconds = Number(res.headers.get("retry-after"));
      if (Number.isFinite(seconds) && seconds > 0) err.retryAfterMs = seconds * 1000;
      throw err;
    }
    return res.json();
  }

  return {
    get: (path, query) => request(path, query),
    async list(path, key, query = {}, maxPages = 10) {
      const out: any[] = [];
      let pageToken: string | undefined;
      for (let i = 0; i < maxPages; i++) {
        const data = await request(path, { ...query, pageSize: "100", pageToken });
        out.push(...(data[key] ?? []));
        pageToken = data.nextPageToken;
        if (!pageToken) break;
      }
      return out;
    },
  };
}
