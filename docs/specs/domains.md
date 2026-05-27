# Domain Spec

Domain ownership is explicit. Do not repurpose a domain without updating nginx vhosts, `.env.example`, README, and verification docs.

| Domain variable | Example | Responsibility |
|---|---|---|
| `APEX_DOMAIN` | `ruyin.ai` | Brand landing page |
| `WWW_DOMAIN` | `www.ruyin.ai` | Landing page copy and REALITY camouflage target is separate via `REALITY_SNI` |
| `EDGE_DOMAIN` | `vpn.ruyin.ai` | Invite-bound user account portal and user-facing edge host |
| `SUB_DOMAIN` | `sub.ruyin.ai` | Marzban native subscription endpoint with normalized response metadata |
| `CONSOLE_DOMAIN` | `console.ruyin.ai` | Marzban console and `/invites/` invite management page |
| `PASS_DOMAIN` | `pass.ruyin.ai` | Vaultwarden web app |
| `VAULT_DOMAIN` | `vault.ruyin.ai` | Reserved placeholder |

Subscription URL format is always:

```text
https://sub.ruyin.ai/sub/<marzban-token>
```

Do not expose `/sub/<token>/clash-meta` publicly. nginx intentionally returns `404` for that and every non-native subscription path.

Do not publish a static page listing every user's subscription URL.

Invite management lives at `https://console.ruyin.ai/invites/`. It lists existing Marzban users and shows each user's binding state: bound, invite pending, or pending binding. Admins generate one-time invite codes only for unbound users. The public account portal at `https://vpn.ruyin.ai` lets users choose a display name, activate the invite, set a password, and view only their own subscription data.
