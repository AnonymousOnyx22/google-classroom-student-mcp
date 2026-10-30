export const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export const SCOPES = [
  "https://www.googleapis.com/auth/classroom.courses.readonly",
  "https://www.googleapis.com/auth/classroom.coursework.me.readonly",
  "https://www.googleapis.com/auth/classroom.student-submissions.me.readonly",
  "https://www.googleapis.com/auth/classroom.announcements.readonly",
  "https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly",
  // get_course_materials reads the topic names to group materials; without it the list comes back ungrouped
  "https://www.googleapis.com/auth/classroom.topics.readonly",
];

export type TokenProvider = () => Promise<string>;

export interface AuthEnv {
  GOOGLE_ACCESS_TOKEN?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REFRESH_TOKEN?: string;
}

async function postForm(url: string, body: Record<string, string>, fetchImpl: typeof fetch): Promise<any> {
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const why = data.error_description ?? data.error ?? `HTTP ${res.status}`;
    throw new Error(
      `Google sign-in failed (${why}). While your app is in testing mode, Google expires refresh tokens after 7 days. Run \`login\` again to get a new refresh token.`,
    );
  }
  return data;
}

export function createTokenProvider(env: AuthEnv, fetchImpl: typeof fetch = fetch, tokenUrl = TOKEN_URL): TokenProvider {
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REFRESH_TOKEN) {
    let cached: { token: string; expires: number } | undefined;
    return async () => {
      if (cached && cached.expires > Date.now() + 60_000) return cached.token;
      const data = await postForm(
        tokenUrl,
        {
          grant_type: "refresh_token",
          client_id: env.GOOGLE_CLIENT_ID!,
          client_secret: env.GOOGLE_CLIENT_SECRET!,
          refresh_token: env.GOOGLE_REFRESH_TOKEN!,
        },
        fetchImpl,
      );
      cached = { token: data.access_token, expires: Date.now() + Number(data.expires_in ?? 3600) * 1000 };
      return cached.token;
    };
  }
  if (env.GOOGLE_ACCESS_TOKEN) {
    const token = env.GOOGLE_ACCESS_TOKEN;
    return async () => token;
  }
  throw new Error(
    "No Google credentials found. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN (run the login command to get them), or set GOOGLE_ACCESS_TOKEN for a quick one hour test.",
  );
}

export function buildAuthUrl(clientId: string, redirectUri: string): string {
  const u = new URL(AUTH_URL);
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", SCOPES.join(" "));
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  return u.toString();
}

export async function exchangeCode(
  params: { clientId: string; clientSecret: string; code: string; redirectUri: string },
  fetchImpl: typeof fetch = fetch,
  tokenUrl = TOKEN_URL,
): Promise<{ refresh_token: string; access_token: string }> {
  const data = await postForm(
    tokenUrl,
    {
      grant_type: "authorization_code",
      code: params.code,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      redirect_uri: params.redirectUri,
    },
    fetchImpl,
  );
  if (!data.refresh_token) {
    throw new Error("Google did not return a refresh token. Remove this app from your Google account's connected apps and try again.");
  }
  return data;
}
