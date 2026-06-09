import type { SessionPayload } from "./types";

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as T;
  if (!response.ok) {
    throw Object.assign(new Error("Request failed"), { payload, response });
  }
  return payload;
}

export function ssoStartUrl(session: SessionPayload, invite?: string) {
  if (session.ssoUrl) {
    return invite ? `/auth/start?invite=${encodeURIComponent(invite)}` : "/auth/start";
  }
  return session.loginUrl || "https://console.vxture.com/zh-CN/signin";
}
