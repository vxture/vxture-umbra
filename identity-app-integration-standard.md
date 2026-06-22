# Vxture 应用接入标准（OIDC RP）— 跨子域 + 跨域

> 版本 v1.0（2026-06-18）。状态：**接口规范（对接基准）**，依据当前 `feat/identity-platform-rebuild` 生产代码核对。
> 统一并取代分散的 [`identity-sso-p3-ruyin-integration-contract.md`](identity-sso-p3-ruyin-integration-contract.md)（跨域）与 [`identity-sso-p4-app-integration-contract.md`](identity-sso-p4-app-integration-contract.md)（子域 + provisioning）：本文是 app 接入的**单一标准**；provisioning（开通 webhook）属 commerce/OUT，单列见 §14。
> 术语：**IdP** = vxture 平台（issuer `https://accounts.vxture.com`，dev `http://localhost:3090`）；**RP/App** = 接入方（其后端 = app-bff）。
> 适用范围：`realm=tenant` 的业务应用接入。operator（运营后台）不走本标准。

---

## 0. 总览：一种机制，两种部署模式

所有应用都是 IdP 的 **OIDC 授权码 + PKCE(S256) RP**，RS256 验签，**token 只在 app 后端服务端流转，浏览器只持不透明的 RP 会话 cookie**。登录流程对两种模式**机制相同**（顶级跳转到 IdP `/oidc/authorize`，禁 iframe/XHR 静默授权）；差异只在**域、cookie 作用域、登出依赖**：

| 维度 | 模式 A：跨子域（`*.vxture.com`） | 模式 B：跨域（独立注册域） |
| --- | --- | --- |
| 例子 | `console.vxture.com` / `admin*` / `xuanzhen.vxture.com` | **`ruyin.ai`（当前首个）** |
| `redirect_uri` | `https://{app}.vxture.com/auth/callback` | `https://{app-domain}/auth/callback` |
| 中央会话 `vx_sid` | `.vxture.com` cookie，浏览器对所有子域 + accounts 都带 | 仅对 `accounts.vxture.com` 第一方；**绝不发往 app 域** |
| 静默 SSO | 顶级跳 accounts/authorize → 带 `vx_sid` → 静默发码 | **同左**（顶级跳转后浏览器对 accounts 第一方带 `vx_sid`） |
| RP 会话 cookie | host-only 于 `{app}.vxture.com` | host-only 于 app 域 |
| 跨域 cookie 共享 | 理论可（`.vxture.com`），**但本标准不依赖** | **不可能**（不同注册域） |
| 全局登出（SLO） | back-channel logout（**强烈建议**） | back-channel logout（**唯一手段，必须**） |

> 结论：两模式**接口完全一致**，App 按同一套实现；跨域只是多了"必须实现 back-channel logout + 绝不尝试 cookie/iframe 静默"两条硬约束。

---

## 1. 平台提供（IdP 侧，已就绪）

| 项 | 值 |
| --- | --- |
| Issuer | `https://accounts.vxture.com`（dev `http://localhost:3090`） |
| Discovery | `GET {issuer}/.well-known/openid-configuration`（**权威自描述**，下文为冻结契约） |
| JWKS | `GET {issuer}/oidc/jwks`（RS256 公钥，支持轮换；未命中 `kid` 刷新一次） |
| `client_id` / `client_secret` | 平台登记派发；secret 经 secret manager（不入任一代码库），平台只存 bcrypt hash |
| 客户端认证 | `client_secret_basic`（荐）或 `client_secret_post` |
| access_token TTL / refresh TTL | 由 client 配置（默认 access 900s / refresh 30d，平台可调） |

App **不直接访问平台 DB**；身份/组织上下文一律经 token，必要时经服务间 API。

---

## 2. OIDC 端点契约（相对 `{issuer}`）

| 端点 | 说明 |
| --- | --- |
| `GET /oidc/authorize` | 授权端点，见 §2.1 |
| `POST /oidc/token` | 令牌端点（authorization_code / refresh_token），见 §2.2 |
| `GET /oidc/jwks` | RS256 公钥集（验签） |
| `GET /oidc/userinfo` | `Bearer access_token` → 用户档案（可选；本地验签即可不调） |
| `POST /oidc/revoke` | RFC7009，恒 200 |
| `GET /oidc/end_session` | 全局登出：销毁中央会话 + 对所有 RP 发 back-channel logout；`post_logout_redirect_uri`（须登记）、`state` |

`code_challenge_methods_supported=["S256"]`、`grant_types=["authorization_code","refresh_token"]`、`response_types=["code"]`、`token_endpoint_auth_methods=["client_secret_basic","client_secret_post"]`。

### 2.1 `GET /oidc/authorize`

参数：`response_type=code`(✓)、`client_id`(✓)、`redirect_uri`(✓，**精确白名单**否则 400 不重定向)、`scope`(✓)、`code_challenge`(✓)、`code_challenge_method=S256`(✓，**不支持 plain**)、`state`(荐)、`nonce`(荐)、`prompt=none`(可选，静默)、`tenant_hint`(可选，切组织)。

行为：
- **有可用中央会话**（`vx_sid` 命中、realm 匹配）→ `302 {redirect_uri}?code=&state=`。
- **无会话 + 交互**（无 `prompt=none`）→ `302 {LOGIN_UI_BASE_URL}/login?login_challenge=&realm=tenant`（IdP 托管登录页在 accounts 面；**App 不实现登录 UI**）。
- **无会话 + `prompt=none`** → `302 {redirect_uri}?error=login_required&state=`。
- 其它 OIDC 错误经 `redirect_uri` 回 `error=`。

### 2.2 `POST /oidc/token`（`application/x-www-form-urlencoded`）

授权码换 token：`grant_type=authorization_code` + `code` + `redirect_uri`（须与 authorize 一致）+ `code_verifier`。
刷新：`grant_type=refresh_token` + `refresh_token`（不透明，**每次轮换**）。
成功 200：`{access_token(RS256 JWT), token_type:"Bearer", expires_in, refresh_token(已轮换), id_token(RS256 JWT), scope}`。
失败：`400 invalid_grant`（码失效/redirect 不符/PKCE 不符/refresh 重放→family 吊销）、`401 invalid_client`（client 认证失败）。

---

## 3. 登录流程（跨域示意；子域同构）

```
浏览器                         app-bff                          IdP(accounts.vxture.com)
 │ GET app(未登录)              │                                  │
 │ ──顶级导航─────────────────▶ │ /auth/login: 生成 PKCE+state+nonce 存服务端
 │ ◀─302─ accounts/oidc/authorize?... (顶级整页跳转) ───────────────▶│
 │ ═══ 浏览器对 accounts 第一方，自动带 vx_sid(Lax) ════ 有会话→静默发码 │
 │ ◀─302─ {app}/auth/callback?code=&state= ─────────────────────────│
 │ ──GET callback────────────▶ │ POST /oidc/token(服务端,带 secret)──▶│
 │                             │ ◀── id+access+refresh ──────────────│
 │                             │ 验签/验 nonce → 建 RP 会话 → set cookie│
 │ ◀─302 returnTo + Set-Cookie __Host-vx_rp_session ─────────────────│
```

**硬约束**：`/auth/login → /oidc/authorize` 必须**顶级整页导航**（`302`/`window.location`）；**绝不用 iframe / XHR 静默授权**（跨站 cookie 限制会使 `vx_sid` 不携带）。SSO 依赖"重定向落到 IdP 域时浏览器对 IdP 第一方"，不依赖任何跨域共享 cookie。

---

## 4. App 须实现的端点（app-bff）

| 端点 | 职责 |
| --- | --- |
| `GET /auth/login` | 生成 `pkce(verifier,challenge)`+`state`+`nonce`，存服务端（Redis，键含 state，TTL ~600s），`302` 到 `/oidc/authorize`；支持 `returnTo`（白名单校验后回跳） |
| `GET /auth/callback` | 按 state 取回并删 authreq → `POST /oidc/token` 换码 → **验 id_token**（§6）→ 建 RP 会话 + 维护 `sid→rpsid` 索引 → set `__Host-vx_rp_session` → `302 returnTo` |
| 会话/bootstrap（如 `GET /auth/session` 或 `/api/me`） | 读 cookie → 验/解 access_token（近过期静默刷新）→ 回前端所需 claims |
| `POST /auth/logout` | 本地销毁 RP 会话 + 清 cookie；`302 {issuer}/oidc/end_session?post_logout_redirect_uri=&state=` 触发全局登出 |
| `POST /auth/backchannel-logout` | **必须实现**（跨域唯一登出手段），见 §8 |

> 既有实现可复用 `@vxture/core-oidc-rp`（`HttpOidcRpClient`/`RpAuthService`/`RpSessionStore`）——website/console/admin 即基于它。外部仓库 App 按本契约自行实现等价逻辑亦可。

---

## 5. 会话与 Cookie 模型（强制）

- **token 只在 app-bff 服务端持有**（RP 会话存服务端 Redis），浏览器**绝不**见 access/id/refresh token。
- 浏览器仅持 RP 会话 cookie：`__Host-vx_rp_session`（prod）/ `vx_rp_session`（dev http），不透明随机串指向服务端会话，`HttpOnly; Secure; SameSite=Lax; Path=/`，**host-only**（`__Host-` 前缀要求无 `Domain`）。
- **RP 会话 cookie 永不跨注册域共享**；跨域 App 不得期望读到 `vx_sid` 或任何 `.vxture.com` cookie。

---

## 6. Token 校验规则（RP 必须强制）

对 **id_token / access_token / logout_token** 一律：
1. `alg` 必须 `RS256`；**显式拒 `none` / `HS*`**（防降级）。
2. header 须有 `kid` → 按 `kid` 从 `/oidc/jwks` 取公钥（**缓存**，未命中刷新一次再试）。
3. `iss === https://accounts.vxture.com`。
4. `aud === <自己的 client_id>`（平台逐 token 强制；RP 须再校验）。
5. `exp` 容许 **60s 时钟偏移**。
6. id_token：`nonce` 必须等于本次请求发出的 `nonce`。
7. **绝不信任**未验签 token 或浏览器侧传入的 claim。

---

## 7. Token claims（以现网为准）

> ⚠️ 命名现状：租户上下文 claim 目前是 `active_tenant*` 系列（数据层已迁 org/workspace，claim 名暂沿用 tenant 口径，`company`→`organization` 映射）。App 按**本文档名**编码，平台若改名将升版本 + 重叠期通知。

**id_token**（exp 300s）：`{iss, aud=<client_id>, sub:"usr_<uuid>", iat, exp, jti, sid, nonce?, auth_time, userType:"tenant_user"}`。

**access_token（tenant realm，exp=client TTL）**：
```json
{
  "iss":"https://accounts.vxture.com", "aud":"<client_id>", "sub":"usr_<uuid>",
  "iat":..., "exp":..., "jti":"...", "scope":"openid profile <app>", "token_type":"Bearer",
  "userType":"tenant_user", "sid":"<中央会话 id>",
  "account_status":"active", "phone":"+86...", "phone_verified":true, "email":"...", "email_verified":false,
  "active_tenant":"<uuid>", "active_tenant_type":"individual|organization",
  "active_tenant_role":"owner|...", "active_tenant_status":"active|trial|frozen|cancelled",
  "active_tenant_env":"...", "tenants":[{"tenant_id":"...","type":"...","role":"..."}],
  "entitlement":{"app":"<app>","plan":"...","status":"active|trial|past_due|expired|canceled","expires_at":<epoch|null>}
}
```
- `sub` 恒 `usr_` 前缀；业务库引用建议存完整 `sub`。
- **`entitlement` 仅当该 client 配置了 `product_ref` 且存在订阅时出现**。起步期（commerce 未上线）建议 App **不依赖** `entitlement`，业务授权由 App 自有库按 `(active_tenant, sub)` 解析（见 §14）。

---

## 8. Back-channel Logout（跨域唯一登出手段，必须实现）

全局登出销毁 `.vxture.com` 的 `vx_sid`，**无法**清掉 App 域 host-only 的 RP 会话 cookie——唯一途径是 IdP 服务端 → App 服务端的 back-channel logout。

IdP 发 `POST {back_channel_logout_uri}`，`application/x-www-form-urlencoded`，body `logout_token=<RS256 JWT>`，claims：`{iss, aud=<client_id>, sub, iat, exp(~120s), jti, sid, events:{"http://schemas.openid.net/event/backchannel-logout":{}}}`。

App 须：① 验 `logout_token`（§6 全套 + 校验 `events` 含 backchannel-logout 且含 `sid`，**禁含 `nonce`**）；② 用建会话时维护的 `sid→rpsid` 索引找到该 `sid` 全部 RP 会话 → 销毁；③ 回 `200`（best-effort）。

---

## 9. 刷新与轮换

- `refresh_token` 不透明串，服务端存储；**每次刷新轮换**（返回新 refresh，旧作废）。
- **重放检测**：重复用已消费 refresh → IdP 吊销整个 family 回 `400 invalid_grant`；App 应销毁本地会话并转重登。
- **静默续期**：access 近过期（剩 ≤60s）时 app-bff 后台用 refresh 换新，`rpsid` cookie 不变。

---

## 10. 客户端注册（平台侧 `iam.oidc_client`）

App 接入须由平台登记一行 `oidc_client`：

| 列 | 说明 |
| --- | --- |
| `client_id` | 唯一标识（= token `aud`、authorize `client_id`） |
| `client_secret_hash` | bcrypt(secret)；明文经 secret manager 派发给 App，**不入库/不入代码库** |
| `realm` | `tenant` |
| `redirect_uris[]` | 精确白名单，如 `https://ruyin.ai/auth/callback` |
| `post_logout_redirect_uris[]` | end_session 回跳白名单 |
| `back_channel_logout_uri` | App 的 back-channel 接收端点（跨域**必填**） |
| `allowed_scopes[]` | 如 `["openid","profile","<app>"]` |
| `product_ref` | 可空；置则驱动 `entitlement` claim（起步期可不置，见 §14） |
| `display_name` / `logo_url` | 登录页/统一登出页品牌展示 |

登记方式：平台在 `seed-catalog.mjs` 的 oidc_client 列表加该 client（现有 website/console/admin），secret hash 经 `27-provision-client-secrets`（生产节点部署）注入；生产 `redirect_uris` 等由对应 `*_BASE_URL` env 派生，须与登记值一致。

---

## 11. ruyin.ai —— 首个跨域应用

| 项 | 值 |
| --- | --- |
| 模式 | **B 跨域** |
| `client_id` | `ruyin` |
| `realm` | `tenant` |
| `redirect_uri` | `https://ruyin.ai/auth/callback`（dev 由 `RUYIN_BASE_URL` 派生） |
| `back_channel_logout_uri` | `https://ruyin.ai/auth/backchannel-logout`（必填） |
| `post_logout_redirect_uri` | `https://ruyin.ai/...`（须登记） |
| `allowed_scopes` | `openid profile ruyin` |
| `product_ref` | **起步期不置**（不发 entitlement；ruyin 自有业务授权）。商业化后再置。 |

**ruyin 落地待办（平台侧）**：① `seed-catalog.mjs` 加 `ruyin` oidc_client 行（含 back_channel/post_logout/scopes，redirect 由 `RUYIN_BASE_URL` 派生）；② `27-provision-client-secrets` 纳入 `ruyin`（生成 secret + hash）；③ 生产 `RUYIN_BASE_URL` 确认并落 `redirect_uris`。
**ruyin 落地待办（ruyin 侧）**：按 §4 实现 5 个端点 + §6 验签 + §8 back-channel + §5 cookie 模型 + §9 刷新轮换。

---

## 12. 配置 / 环境变量（app-bff）

| 变量 | 说明 |
| --- | --- |
| `OIDC_ISSUER` | `https://accounts.vxture.com` |
| `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` | 平台登记派发（secret 经 secret manager） |
| `OIDC_REDIRECT_URI` | App 的 `/auth/callback`（须 = 登记白名单） |
| `OIDC_SCOPES` | 如 `openid profile ruyin` |
| `OIDC_POST_LOGOUT_REDIRECT_URI` | end_session 回跳（dev 跨端口须显式设；prod issuer==accounts 默认即 `/logout`） |
| `RP_SESSION_TTL` | RP 会话 TTL（建议 ≤ refresh TTL） |

---

## 13. 验收清单（双方联调）

- [ ] 已在 vxture 登录 → 顶级访问 App **免再登录**（`vx_sid` 静默发码）。
- [ ] 篡改 id/access/logout_token → App **拒**（RS256/iss/aud/exp/nonce）。
- [ ] 浏览器**零 OIDC token**，仅 `__Host-vx_rp_session`。
- [ ] refresh 轮换：旧 refresh 重放被拒（family 吊销）。
- [ ] 全局登出 → App 经 **back-channel** 会话被杀，下次请求重登。
- [ ] 非顶级（iframe）静默授权**不被依赖**。
- [ ]（跨域）`redirect_uri` 不符 → 400 不重定向。

---

## 14. 范围边界（避免过度，起步期）

- **Provisioning（开通 webhook）= OUT**：属 commerce，当前 parked（#264）。需要业务空间开通编排时再按 [`identity-sso-p4-provisioning.md`](identity-sso-p4-provisioning.md) 落地；**本标准不含**。
- **Entitlement 起步期不依赖**：commerce 未上线，建议 App 不置 `product_ref`、业务授权走 App 自有库；商业化后再启用 token `entitlement` 硬门控。
- **跨域 SLO 可配置（D-AW）**：是否参与全域 back-channel logout 可逐 App 配置；ruyin 默认参与。
- 不在本标准内：operator 接入（运营后台，另案）、社交联邦（IdP 内部）、MFA（高权限入口，另案）。
