/**
 * Map verified OIDC token payloads onto the stored session shapes. Identity
 * claims come primarily from the access_token (richer tenant context, standard
 * section 7); sid/auth come from the id_token.
 */
import type { JWTPayload } from "jose";
import type { IdentityClaims, TokenBundle } from "./session-store";
import type { TokenSet } from "./oidc";

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function bool(v: unknown): boolean {
  return v === true;
}

function strList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
  return typeof v === "string" && v ? [v] : [];
}

export function toIdentityClaims(idClaims: JWTPayload, accessClaims: JWTPayload): IdentityClaims {
  const sid = str(idClaims.sid) || str(accessClaims.sid);
  // Live IdP claim names are org/workspace/roles; fall back to the older
  // active_tenant* names the standard documented, just in case.
  const roles = accessClaims.roles !== undefined
    ? strList(accessClaims.roles)
    : strList(accessClaims.active_tenant_role);
  return {
    sub: str(accessClaims.sub) || str(idClaims.sub),
    sid,
    email: str(accessClaims.email),
    email_verified: bool(accessClaims.email_verified),
    phone: str(accessClaims.phone),
    phone_verified: bool(accessClaims.phone_verified),
    account_status: str(accessClaims.account_status),
    active_org: str(accessClaims.active_org) || str(accessClaims.active_tenant),
    active_workspace: str(accessClaims.active_workspace),
    roles,
    user_type: str(accessClaims.userType) || str(idClaims.userType),
    exp: typeof accessClaims.exp === "number" ? accessClaims.exp : 0,
  };
}

export function toTokenBundle(tokens: TokenSet, idClaims: JWTPayload): TokenBundle {
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    access_exp: nowSec + (Number.isFinite(tokens.expires_in) ? tokens.expires_in : 900),
    id_claims: idClaims as Record<string, unknown>,
  };
}
