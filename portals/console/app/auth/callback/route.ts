import { NextRequest, NextResponse } from "next/server";
import { getOidcConfig, type OidcConfig } from "../lib/config";
import { exchangeCode, verifyToken } from "../lib/oidc";
import { takeAuthRequest, createSession } from "../lib/session-store";
import { toIdentityClaims, toTokenBundle } from "../lib/claims";
import { setSessionCookie, readLoginStateCookie, clearLoginStateCookie } from "../lib/cookie";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const INVITE_RE = /^[A-Za-z0-9-]{1,64}$/;

/**
 * OIDC RP callback: exchange the authorization code (with the server-side PKCE
 * verifier), verify the id_token (RS256/iss/aud/exp/nonce) and access_token,
 * create the server-side RP session, and hand the browser only the opaque
 * vx_rp_session cookie.
 */
async function oidcCallback(request: NextRequest, cfg: OidcConfig): Promise<NextResponse> {
  const origin = request.nextUrl.origin;
  const fail = (reason: string) => {
    const apex = cfg.cookieDomain.replace(/^\./, "").trim();
    const dest = apex ? `https://${apex}/?sso=${encodeURIComponent(reason)}` : `/?sso=${encodeURIComponent(reason)}`;
    const res = NextResponse.redirect(new URL(dest, origin));
    clearLoginStateCookie(res, cfg);
    return res;
  };

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");
  if (!state) return fail("state");

  // The callback must come from the same browser that began login: `state` must
  // match the host-only binding cookie. Checked before consuming the authreq so
  // a forged callback cannot burn a pending login.
  const boundState = readLoginStateCookie(request, cfg);
  if (!boundState || boundState !== state) return fail("state");

  const authReq = await takeAuthRequest(cfg, state);
  if (!authReq) return fail("state");
  if (error) return fail(error);
  if (!code) return fail("missing");

  let rpsid: string;
  try {
    const tokens = await exchangeCode(cfg, code, authReq.codeVerifier);
    const idClaims = await verifyToken(cfg, tokens.id_token, { expectedNonce: authReq.nonce });
    const accessClaims = await verifyToken(cfg, tokens.access_token);
    // The id_token and access_token must describe the same subject (reject a
    // mismatched / substituted token pair).
    if (!idClaims.sub || idClaims.sub !== accessClaims.sub) return fail("invalid");
    const identity = toIdentityClaims(idClaims, accessClaims);
    if (!identity.sub || !identity.sid) return fail("invalid");
    rpsid = await createSession(cfg, identity, toTokenBundle(tokens, idClaims));
  } catch {
    return fail("failed");
  }

  const invite = INVITE_RE.test(authReq.invite) ? authReq.invite : "";
  const destination = invite ? `/register?invite=${encodeURIComponent(invite)}` : authReq.returnTo || "/";
  const response = NextResponse.redirect(new URL(destination, origin));
  setSessionCookie(response, cfg, rpsid);
  clearLoginStateCookie(response, cfg);
  return response;
}

export async function GET(request: NextRequest) {
  const cfg = getOidcConfig();
  if (!cfg) {
    return new NextResponse("OIDC RP is not configured", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  return oidcCallback(request, cfg);
}
