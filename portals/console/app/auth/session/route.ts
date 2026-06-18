import { NextRequest, NextResponse } from "next/server";
import { getOidcConfig } from "../lib/config";
import { refreshTokens, verifyToken } from "../lib/oidc";
import { getIdentity, getTokens, putTokens, destroySession } from "../lib/session-store";
import { toTokenBundle } from "../lib/claims";
import { clearSessionCookie } from "../lib/cookie";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ANON = { authenticated: false } as const;

/**
 * Bootstrap endpoint: resolves the opaque session cookie to the current user's
 * identity claims. Tokens never leave the server; when the access token is
 * within 60s of expiry we rotate it server-side (refresh_token grant) and keep
 * the same rpsid cookie. A revoked refresh family tears the local session down.
 */
export async function GET(request: NextRequest) {
  const cfg = getOidcConfig();
  if (!cfg) return NextResponse.json(ANON, { status: 200 });

  const rpsid = request.cookies.get(cfg.cookieName)?.value;
  if (!rpsid) return NextResponse.json(ANON, { status: 200 });

  const identity = await getIdentity(cfg, rpsid);
  if (!identity) {
    const res = NextResponse.json(ANON, { status: 200 });
    clearSessionCookie(res, cfg);
    return res;
  }

  const tokens = await getTokens(cfg, rpsid);
  const nowSec = Math.floor(Date.now() / 1000);
  if (tokens && tokens.access_exp - nowSec <= 60) {
    try {
      const rotated = await refreshTokens(cfg, tokens.refresh_token);
      const idClaims = await verifyToken(cfg, rotated.id_token);
      await verifyToken(cfg, rotated.access_token);
      await putTokens(cfg, rpsid, toTokenBundle(rotated, idClaims));
    } catch {
      await destroySession(cfg, rpsid);
      const res = NextResponse.json(ANON, { status: 200 });
      clearSessionCookie(res, cfg);
      return res;
    }
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      sub: identity.sub,
      email: identity.email,
      emailVerified: identity.email_verified,
      phone: identity.phone,
      phoneVerified: identity.phone_verified,
      accountStatus: identity.account_status,
      orgId: identity.active_org,
      workspaceId: identity.active_workspace,
      roles: identity.roles,
      userType: identity.user_type,
    },
  });
}
