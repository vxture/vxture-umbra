/**
 * OIDC token-endpoint calls and RS256 token verification (Vxture App
 * Integration Standard sections 2.2, 6, 8). jose enforces the allowed
 * algorithms list, so `none`/HS* are rejected; `kid` is resolved from the
 * remote JWKS with caching and a single refresh on miss.
 */
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { OidcConfig } from "./config";

export interface TokenSet {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  id_token: string;
  scope?: string;
}

// Network guards: a hung IdP must not stall verification or token exchange.
const JWKS_TIMEOUT_MS = 5000;
const TOKEN_TIMEOUT_MS = 8000;

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(cfg: OidcConfig) {
  let jwks = jwksCache.get(cfg.endpoints.jwks);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(cfg.endpoints.jwks), {
      timeoutDuration: JWKS_TIMEOUT_MS,
      cooldownDuration: 30000,
    });
    jwksCache.set(cfg.endpoints.jwks, jwks);
  }
  return jwks;
}

/**
 * Verify an RS256 JWT (id_token / access_token / logout_token) against the
 * issuer JWKS. Enforces alg=RS256, iss, aud=client_id, exp (60s skew). When
 * `expectedNonce` is provided the token's `nonce` must match exactly.
 */
export async function verifyToken(
  cfg: OidcConfig,
  token: string,
  opts: { expectedNonce?: string } = {},
): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, getJwks(cfg), {
    algorithms: ["RS256"],
    issuer: cfg.issuer,
    audience: cfg.clientId,
    clockTolerance: 60,
  });
  // jwtVerify enforces exp/nbf but not iat; reject tokens issued in the future
  // beyond clock skew (defense against forged/replayed timestamps).
  if (typeof payload.iat === "number" && payload.iat > Math.floor(Date.now() / 1000) + 60) {
    throw new Error("iat in the future");
  }
  if (opts.expectedNonce !== undefined) {
    if (payload.nonce !== opts.expectedNonce) {
      throw new Error("nonce mismatch");
    }
  }
  return payload;
}

function basicAuthHeader(cfg: OidcConfig): string {
  const raw = `${encodeURIComponent(cfg.clientId)}:${encodeURIComponent(cfg.clientSecret)}`;
  return `Basic ${Buffer.from(raw).toString("base64")}`;
}

async function postToken(cfg: OidcConfig, body: URLSearchParams): Promise<TokenSet> {
  const res = await fetch(cfg.endpoints.token, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: basicAuthHeader(cfg),
    },
    body: body.toString(),
    cache: "no-store",
    signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`token endpoint ${res.status}: ${detail.slice(0, 200)}`);
  }
  return (await res.json()) as TokenSet;
}

/** Exchange an authorization code for tokens (grant_type=authorization_code). */
export function exchangeCode(cfg: OidcConfig, code: string, codeVerifier: string): Promise<TokenSet> {
  return postToken(
    cfg,
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: cfg.redirectUri,
      code_verifier: codeVerifier,
    }),
  );
}

/** Rotate tokens with a refresh_token (grant_type=refresh_token). */
export function refreshTokens(cfg: OidcConfig, refreshToken: string): Promise<TokenSet> {
  return postToken(
    cfg,
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  );
}

/** Build the top-level /oidc/authorize redirect URL. */
export function buildAuthorizeUrl(
  cfg: OidcConfig,
  params: { state: string; nonce: string; codeChallenge: string },
): string {
  const url = new URL(cfg.endpoints.authorize);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("scope", cfg.scopes);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", params.state);
  url.searchParams.set("nonce", params.nonce);
  return url.toString();
}

/** Build the /oidc/end_session global-logout redirect URL. */
export function buildEndSessionUrl(cfg: OidcConfig, state: string): string {
  const url = new URL(cfg.endpoints.endSession);
  if (cfg.postLogoutRedirectUri) {
    url.searchParams.set("post_logout_redirect_uri", cfg.postLogoutRedirectUri);
  }
  url.searchParams.set("state", state);
  return url.toString();
}
