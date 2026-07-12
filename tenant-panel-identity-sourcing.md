---
name: tenant-panel-identity-sourcing
description: Console header tenant panel reads OIDC claims; personal-vs-team is active_org_type (NOT userType); IdP now emits active_org_type/active_org_name/active_workspace_name; members/plan need a tenancy API
metadata: 
  node_type: memory
  type: project
  originSessionId: 03a76e6a-6260-4afc-b2d0-8e515c19ebee
---

Console header tenant panel (`portals/console/app/ui/tenant-panel.tsx`) sources
ALL tenant info from OIDC claims (no platform query): `active_org` -> tenantId/
orgId, `active_workspace` -> workspaceId, `userType` -> org/personal, `roles`.
Flow: `claims.ts` (reads access_token) -> Redis `rpsess:<rpsid>` (full
IdentityClaims) -> `services/account/account.py` `vxture_payload_from_session`
-> `public_vxture_user` -> `/api/account/session`.

PR #153's Fix A was WRONG: it set `isOrg = userType === "organization"`, but
`userType` is a realm marker ("tenant_user" | "operator"), NEVER "organization"
-> it mislabeled EVERY account as personal. The real personal-vs-team
discriminator is the org's `type` ("personal" | "team"), which was NOT in the
token (every account has a personal org, so `active_org`/orgId alone can't tell
them apart either).

**Fix (2026-06-24, two repos):** added the org TYPE + display NAMES to the
access_token end to end.
- **IdP (vxture, branch feat/idp-org-context-claims)**: emit `active_org_type`,
  `active_org_name`, `active_workspace_name`. Wired through
  `services/identity/organization` `ActiveOrgContext` + `active-context.service`
  (org type/name from the joined `OrgView`, workspace name from
  getDefaultWorkspace), `bff/auth-bff` `access-claims.ts` (input+emit),
  `token.service.ts`, both `issueAccessToken` sites (`oidc.service.ts` tenant
  mint + `authn.service.ts`), the openid-config `claims_supported`, and the
  canonical RP toolkit `@vxture/core-oidc-rp` (`RpUser` + `mapAccessClaims`).
  Contract doc: `identity-sso-p3-ruyin-integration-contract.md` §8.
- **RP (umbra console)**: read `active_org_type` through `claims.ts` ->
  session-store `IdentityClaims` -> `account.py` (forward + emit `orgType`) ->
  `types.ts` `VxtureUser.orgType` -> `tenant-panel.tsx`. Now
  `isOrg = orgType === "team"`.

**RP-side fallbacks (when the IdP omits a value):** org_type absent -> Personal;
org_name absent -> `"{name}'s Personal Org"` where name = the actual session
displayName/username (i18n `tenant.personalOrgFallback`); workspace_name absent
-> "Default workspace" (i18n `tenant.defaultWorkspace`). zh/en keys added.

**Still open (NOT fixable in this repo):**
- **members count / plan / tenant list**: volatile business data -> belongs to a
  future tenancy/billing API (back-query with access_token), NOT the token;
  currently placeholders in the panel.

**Why:** names+type = IdP-downstream (cheap, stateless, fits RP model; type is
the only reliable personal/team signal) but members/plan = platform back-query
(token would bloat/stale). Relates to [[ruyin-identity-claims]].
**How to apply:** personal-vs-team is `orgType` ("team")—never `userType`; if
org/workspace names or type are wrong in prod, check the IdP emission first
(verify `active_org_type`/`active_org_name`/`active_workspace_name` in the
access_token), then the RP chain; for members/plan, build a tenancy API.
