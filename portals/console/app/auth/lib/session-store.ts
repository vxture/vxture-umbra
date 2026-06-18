/**
 * Server-side OIDC RP session store backed by Redis. Four key families:
 *   authreq:<state>  short-lived login->callback handshake (verifier, nonce).
 *   rpsess:<rpsid>   verified IDENTITY CLAIMS only (also read by account.py).
 *   rptok:<rpsid>    OIDC token bundle (this BFF only; never leaves the server).
 *   sid:<sid>        SET of rpsid for back-channel logout (one central session
 *                    can map to several RP sessions across the ruyin zone).
 * The browser only ever holds an opaque cookie pointing at <rpsid>.
 */
import Redis from "ioredis";
import { randomToken } from "./pkce";
import type { OidcConfig } from "./config";

export interface AuthRequest {
  codeVerifier: string;
  nonce: string;
  returnTo: string;
  invite: string;
}

/** Identity subset shared with account.py; keep field names stable. Field set
 * mirrors the IdP's claims_supported (openid-configuration): the platform exposes
 * no name/username/picture claim, so email + phone are the only human-readable
 * identifiers. Tenant context uses org/workspace/roles (the live claim names). */
export interface IdentityClaims {
  sub: string;
  sid: string;
  email: string;
  email_verified: boolean;
  phone: string;
  phone_verified: boolean;
  account_status: string;
  active_org: string;
  active_workspace: string;
  roles: string[];
  user_type: string;
  exp: number;
}

export interface TokenBundle {
  access_token: string;
  refresh_token: string;
  access_exp: number;
  id_claims: Record<string, unknown>;
}

let client: Redis | null = null;

function redis(cfg: OidcConfig): Redis {
  if (!client) {
    client = new Redis(cfg.redisUrl, { maxRetriesPerRequest: 2, lazyConnect: false });
  }
  return client;
}

const authReqKey = (state: string) => `authreq:${state}`;
const sessKey = (rpsid: string) => `rpsess:${rpsid}`;
const tokKey = (rpsid: string) => `rptok:${rpsid}`;
const sidKey = (sid: string) => `sid:${sid}`;

const AUTHREQ_TTL = 600;

export async function putAuthRequest(cfg: OidcConfig, state: string, req: AuthRequest): Promise<void> {
  await redis(cfg).set(authReqKey(state), JSON.stringify(req), "EX", AUTHREQ_TTL);
}

/** Atomically fetch and delete the authreq (single-use, prevents replay). */
export async function takeAuthRequest(cfg: OidcConfig, state: string): Promise<AuthRequest | null> {
  const raw = await redis(cfg).getdel(authReqKey(state));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthRequest;
  } catch {
    return null;
  }
}

/** Create an RP session and index it under its central sid. Returns the rpsid. */
export async function createSession(
  cfg: OidcConfig,
  identity: IdentityClaims,
  tokens: TokenBundle,
): Promise<string> {
  const rpsid = randomToken();
  const ttl = cfg.sessionTtlSeconds;
  await redis(cfg)
    .multi()
    .set(sessKey(rpsid), JSON.stringify(identity), "EX", ttl)
    .set(tokKey(rpsid), JSON.stringify(tokens), "EX", ttl)
    .sadd(sidKey(identity.sid), rpsid)
    .expire(sidKey(identity.sid), ttl)
    .exec();
  return rpsid;
}

export async function getIdentity(cfg: OidcConfig, rpsid: string): Promise<IdentityClaims | null> {
  const raw = await redis(cfg).get(sessKey(rpsid));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as IdentityClaims;
  } catch {
    return null;
  }
}

export async function getTokens(cfg: OidcConfig, rpsid: string): Promise<TokenBundle | null> {
  const raw = await redis(cfg).get(tokKey(rpsid));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TokenBundle;
  } catch {
    return null;
  }
}

/** Replace the token bundle after a refresh, preserving the session TTL. */
export async function putTokens(cfg: OidcConfig, rpsid: string, tokens: TokenBundle): Promise<void> {
  await redis(cfg).set(tokKey(rpsid), JSON.stringify(tokens), "KEEPTTL");
}

/** Destroy a single RP session and drop it from its sid index. */
export async function destroySession(cfg: OidcConfig, rpsid: string): Promise<void> {
  const r = redis(cfg);
  const identity = await getIdentity(cfg, rpsid);
  const pipe = r.multi().del(sessKey(rpsid)).del(tokKey(rpsid));
  if (identity?.sid) pipe.srem(sidKey(identity.sid), rpsid);
  await pipe.exec();
}

/** Destroy every RP session for a central sid (back-channel logout). */
export async function destroyBySid(cfg: OidcConfig, sid: string): Promise<number> {
  const r = redis(cfg);
  const rpsids = await r.smembers(sidKey(sid));
  if (rpsids.length === 0) {
    await r.del(sidKey(sid));
    return 0;
  }
  const pipe = r.multi();
  for (const rpsid of rpsids) {
    pipe.del(sessKey(rpsid));
    pipe.del(tokKey(rpsid));
  }
  pipe.del(sidKey(sid));
  await pipe.exec();
  return rpsids.length;
}
