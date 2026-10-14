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
): ClassroomApi {
  async function request(path: string, query: Record<string, string | undefined> = {}): Promise<any> {
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
      throw new ApiError(describeStatus(res.status), res.status, body.slice(0, 500));
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
