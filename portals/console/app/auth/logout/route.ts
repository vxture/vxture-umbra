import { NextRequest, NextResponse } from "next/server";
import { getOidcConfig } from "../lib/config";
import { destroySession } from "../lib/session-store";
import { clearSessionCookie } from "../lib/cookie";
import { buildEndSessionUrl } from "../lib/oidc";
import { randomToken } from "../lib/pkce";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Global (SSO) logout. ruyin and vxture are one first-party suite behind a single
 * IdP, so signing out of ruyin signs the user out everywhere: we destroy this RP
 * session + clear the opaque cookie, then top-level redirect to the IdP
 * end_session endpoint. The IdP destroys the central vx_sid session (logs the
 * user out of vxture and every sibling app), revokes the session's tokens, and
 * fan-outs back-channel logout to every client of the session (so future apps are
 * covered automatically); it then redirects back to post_logout_redirect_uri
 * (ruyin home). No id_token_hint is needed - the IdP identifies the session by its
 * own vx_sid cookie on the top-level redirect. Falls back to a local-only logout
 * (land on home) when no post-logout URI is configured (e.g. dev), so the user is
 * never stranded on the IdP.
 *
 * Accepts both GET and POST so the UI can sign out with a plain top-level
 * navigation (reliable from inside a popover menu, where a programmatic
 * form.submit() races the menu unmount). A cross-site GET can force a sign-out;
 * for a global logout that means signing out of the whole SSO, which is still
 * low-severity (an unwanted sign-out, no data access - logout CSRF per OWASP), and
 * matches how RP-initiated logout links work across the industry.
 */
async function handleLogout(request: NextRequest): Promise<NextResponse> {
  const cfg = getOidcConfig();
  if (!cfg) {
    return new NextResponse("OIDC RP is not configured", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const rpsid = request.cookies.get(cfg.cookieName)?.value;
  if (rpsid) await destroySession(cfg, rpsid);

  // Global logout: hand off to the IdP end_session (kills vx_sid + back-channel
  // fan-out). Without a post-logout URI (dev), degrade to local-only: land on the
  // ruyin apex home instead of stranding the user on the IdP.
  const apex = cfg.cookieDomain.replace(/^\./, "").trim();
  const apexHome = apex ? `https://${apex}/` : new URL("/", request.nextUrl.origin).toString();
  const dest = cfg.postLogoutRedirectUri ? buildEndSessionUrl(cfg, randomToken()) : apexHome;
  const res = NextResponse.redirect(dest, { status: 303 });
  clearSessionCookie(res, cfg);
  return res;
}

export function GET(request: NextRequest) {
  return handleLogout(request);
}

export function POST(request: NextRequest) {
  return handleLogout(request);
}
