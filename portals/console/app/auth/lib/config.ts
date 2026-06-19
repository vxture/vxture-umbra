/**
 * OIDC RP configuration for the ruyin app-bff (Vxture App Integration Standard
 * v1.0). All values come from server-side env; nothing here is exposed to the
 * browser. Endpoint paths are the frozen contract relative to the issuer
 * (standard section 2), so we derive them rather than fetch discovery per call.
 */

export interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string;
  postLogoutRedirectUri: string;
  redisUrl: string;
  sessionTtlSeconds: number;
  cookieName: string;
  cookieDomain: string;
  isProd: boolean;
  endpoints: {
    authorize: string;
    token: string;
    jwks: string;
    endSession: string;
  };
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

/**
 * Returns the OIDC config when the RP is fully configured, otherwise null. The
 * new auth endpoints stay dormant (legacy SSO remains active) until both the
 * issuer and the client secret are provisioned.
 */
export function getOidcConfig(): OidcConfig | null {
  const issuer = trimTrailingSlash((process.env.OIDC_ISSUER || "").trim());
  const clientSecret = (process.env.OIDC_CLIENT_SECRET || "").trim();
  if (!issuer || !clientSecret) return null;

  const clientId = (process.env.OIDC_CLIENT_ID || "ruyin").trim();
  const redirectUri = (process.env.OIDC_REDIRECT_URI || "").trim();
  const redisUrl = (process.env.REDIS_URL || "").trim();
  if (!clientId || !redirectUri || !redisUrl) return null;

  const ttl = Number.parseInt(process.env.RP_SESSION_TTL || "", 10);

  return {
    issuer,
    clientId,
    clientSecret,
    redirectUri,
    scopes: (process.env.OIDC_SCOPES || "openid profile email phone ruyin").trim(),
    postLogoutRedirectUri: (process.env.OIDC_POST_LOGOUT_REDIRECT_URI || "").trim(),
    redisUrl,
    sessionTtlSeconds: Number.isFinite(ttl) && ttl > 0 ? ttl : 2592000,
    cookieName: (process.env.RP_SESSION_COOKIE_NAME || "vx_rp_session").trim(),
    cookieDomain: (process.env.RP_SESSION_COOKIE_DOMAIN || "").trim(),
    isProd: process.env.NODE_ENV === "production",
    endpoints: {
      authorize: `${issuer}/oidc/authorize`,
      token: `${issuer}/oidc/token`,
      jwks: `${issuer}/oidc/jwks`,
      endSession: `${issuer}/oidc/end_session`,
    },
  };
}

/** True when the OIDC RP is configured and the new endpoints should be live. */
export function oidcConfigured(): boolean {
  return getOidcConfig() !== null;
}
