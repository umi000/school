export const BASE      = "http://localhost:4000/api";
export const MEDIA_URL = "http://localhost:4000";   // static uploads served here

/** Build a print URL that carries the JWT so the browser tab is authenticated */
export function printUrl(path: string, extraParams: Record<string, string> = {}): string {
  const params = new URLSearchParams({ token: getToken(), ...extraParams });
  return `${BASE}${path}?${params}`;
}

export function getToken(): string {
  return localStorage.getItem("gbhss_token") || "";
}
export function setToken(t: string) {
  localStorage.setItem("gbhss_token", t);
}
export function clearToken() {
  localStorage.removeItem("gbhss_token");
}

export async function apiFetch(path: string, opts: RequestInit = {}): Promise<unknown> {
  const headers = new Headers(opts.headers ?? {});
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const t = getToken();
  if (t) headers.set("Authorization", `Bearer ${t}`);
  const res = await fetch(BASE + path, { ...opts, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (body as { message?: string }).message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return body;
}
