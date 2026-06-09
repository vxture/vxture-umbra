import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATE_COOKIE = "umbra_sso_state";
const PENDING_INVITE_COOKIE = "umbra_pending_invite";
const INVITE_RE = /^[A-Za-z0-9-]{1,64}$/;

function authBffUrl() {
  return (process.env.AUTH_BFF_URL || "").replace(/\/+$/, "");
}

function internalToken() {
  return process.env.AUTH_INTERNAL_TOKEN || "";
}

function appUrl(request: NextRequest) {
  const configured = process.env.NEXT_PUBLIC_RUYIN_ACCOUNT_URL;
  if (configured) return configured.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production") return "";
  return `${request.nextUrl.protocol}//${request.nextUrl.host}`;
}

function readSetCookies(headers: Headers) {
  const extended = headers as Headers & { getSetCookie?: () => string[] };
  const values = extended.getSetCookie?.();
  if (values?.length) return values;
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

function stateMatches(received: string | null, expected: string | undefined) {
  if (!received || !expected) return false;
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(receivedBuffer, expectedBuffer);
}

function redirectClearingState(path: string, target: string) {
  const response = NextResponse.redirect(new URL(path, target));
  response.cookies.delete({
    name: STATE_COOKIE,
    path: "/auth",
  });
  response.cookies.set(STATE_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/auth",
    maxAge: 0,
  });
  return response;
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");
  const expectedState = request.cookies.get(STATE_COOKIE)?.value;
  const authUrl = authBffUrl();
  const authSecret = internalToken();
  const target = appUrl(request);

  if (!target) {
    return new NextResponse("Ruyin account URL is not configured", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  if (!stateMatches(state, expectedState)) {
    return redirectClearingState("/login?sso=state", target);
  }

  if (error) {
    return redirectClearingState(`/login?sso=${encodeURIComponent(error)}`, target);
  }

  if (!token || !authUrl || !authSecret) {
    return redirectClearingState("/login?sso=missing", target);
  }

  const verify = await fetch(`${authUrl}/auth/crossdomain/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-vxture-internal-auth": authSecret,
    },
    body: JSON.stringify({ token, source: "ruyin.ai" }),
    cache: "no-store",
  });

  if (!verify.ok) {
    return redirectClearingState("/login?sso=invalid", target);
  }

  const payload = (await verify.json().catch(() => ({}))) as {
    sub?: string;
    tenantId?: string;
    email?: string;
    role?: string;
  };

  const sign = await fetch(`${authUrl}/auth/internal/sign`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-vxture-internal-auth": authSecret,
    },
    body: JSON.stringify({
      sub: payload.sub,
      email: payload.email ?? "",
      role: payload.role ?? "member",
      source: "ruyin",
      tenantId: payload.tenantId,
    }),
    cache: "no-store",
  });

  if (!sign.ok) {
    return redirectClearingState("/login?sso=failed", target);
  }

  const pendingInvite = request.cookies.get(PENDING_INVITE_COOKIE)?.value;
  const validInvite = pendingInvite && INVITE_RE.test(pendingInvite) ? pendingInvite : null;
  const destination = validInvite
    ? `/register?invite=${encodeURIComponent(validInvite)}`
    : "/";

  const response = redirectClearingState(destination, target);
  response.cookies.set(PENDING_INVITE_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/auth",
    maxAge: 0,
  });
  for (const cookie of readSetCookies(sign.headers)) {
    response.headers.append("set-cookie", cookie);
  }
  return response;
}
