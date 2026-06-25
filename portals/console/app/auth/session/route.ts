import { NextRequest, NextResponse } from "next/server";
import { getOidcConfig } from "../lib/config";
import { refreshTokens, verifyToken } from "../lib/oidc";
import { getIdentity, getTokens, putTokens, putIdentity, destroySession } from "../lib/session-store";
import { toIdentityClaims, toTokenBundle } from "../lib/claims";
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

  let identity = await getIdentity(cfg, rpsid);
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
      const rotatedId = await verifyToken(cfg, rotated.id_token);
      const rotatedAccess = await verifyToken(cfg, rotated.access_token);
      if (!rotatedId.sub || rotatedId.sub !== rotatedAccess.sub) throw new Error("subject mismatch");
      // Refresh re-derives identity so role/org changes take effect without a
      // full re-login; the subject must stay the same and the sid (back-channel
      // logout index) is preserved if the rotated id_token omits it.
      const fresh = toIdentityClaims(rotatedId, rotatedAccess);
      if (fresh.sub !== identity.sub) throw new Error("subject changed on refresh");
      if (!fresh.sid) fresh.sid = identity.sid;
      else if (fresh.sid !== identity.sid) throw new Error("sid changed on refresh");
      await putIdentity(cfg, rpsid, fresh);
      await putTokens(cfg, rpsid, toTokenBundle(rotated, rotatedId));
      identity = fresh;
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
      displayName: identity.display_name,
      username: identity.username,
      avatarUrl: identity.avatar_url,
      email: identity.email,
      emailVerified: identity.email_verified,
      phone: identity.phone,
      phoneVerified: identity.phone_verified,
      accountStatus: identity.account_status,
      orgId: identity.active_org,
      orgType: identity.active_org_type,
      orgName: identity.active_org_name,
      workspaceId: identity.active_workspace,
      workspaceName: identity.active_workspace_name,
      roles: identity.roles,
      userType: identity.user_type,
    },
  });
}
