# Umbra 项目设计方案

> Repository：`vxture/umbra`  
> Project Name：**Vxture Umbra**  
> Document Type：长期维护设计文档  
> Recommended File：`docs/DESIGN.md`  
> Current Version：`v0.1-draft`  
> Last Updated：2026-05-21

---

## 0. 文档定位

本文档是 `vxture/umbra` 项目的长期设计基准。

后续所有项目结构、脚本、模板、部署方式、运维流程、扩展能力，都应以本文档为依据进行构建和迭代。

本文档目标不是一次性写死全部实现，而是为 VSCode + Codex 构建项目提供明确边界：

1. 先明确项目愿景和职责边界。
2. 再规划目录结构、模块分层和配置规范。
3. 再拆解可执行脚本和模板。
4. 最后形成可重复部署、可验证、可回滚的边缘入口项目。

---

## 1. 项目愿景

### 1.1 项目名称

```text
Vxture Umbra
```

`Umbra` 含义为“本影、阴影”。

项目语义与 `ruyin` 的“如影随形”呼应：

```text
Umbra 是真实业务系统外侧的一层影子入口。
外部访问首先进入 Umbra。
真实业务机隐藏在后端。
入口节点可以快速替换。
业务核心保持稳定。
```

### 1.2 一句话定位

```text
Vxture Umbra 是一套可快速重建的海外边缘入口节点项目，用于代理接入、订阅分发、SNI 分流、证书自动化和后端业务隐藏。
```

### 1.3 核心目标

Umbra 不是普通 VPN 项目，也不是普通 Nginx 项目。

它的核心目标是构建一个可替换的海外入口层：

```text
用户 / 客户端
   ↓
Umbra Edge Node
   ↓
后端业务机 / 内部服务 / 私有网络
```

核心能力：

1. 代理入口：基于 Xray REALITY 提供稳定代理接入。
2. 订阅分发：为 Clash / Mihomo 生成 HTTPS 订阅文件。
3. SNI 分流：公网 443 根据 SNI 分流到 Xray、订阅服务或后端业务。
4. 后端隐藏：业务机不直接暴露为第一入口。
5. 快速重建：新开 VPS 后可通过项目脚本快速部署。
6. 快速迁移：新节点稳定后切换 DNS，旧节点可销毁。
7. 配置备份：关键状态可备份、可恢复、可审计。
8. 安全隔离：真实密钥、UUID、证书、订阅映射不进入 Git。

---

## 2. 项目边界

### 2.1 Umbra 负责的内容

```text
Nginx 入口层
Xray REALITY 代理服务
HTTPS 订阅服务
Clash / Mihomo 订阅生成
Let’s Encrypt 证书签发与续期
用户 UUID 生成与隔离
隐藏订阅路径生成
私有映射文件管理
配置渲染
服务启动
服务验证
配置备份
迁移辅助
```

### 2.2 Umbra 不负责的内容

```text
业务应用本身
数据库
业务 API 代码
业务后台逻辑
用户业务数据
支付系统
SaaS 应用运行时
```

后端业务服务应该在独立业务机或独立应用项目中维护。

Umbra 只作为外层入口、代理和跳板层。

---

## 3. 当前原型经验

### 3.1 已验证原型节点

当前已手工验证过的原型节点：

```text
hostname: vxture-worker-03
deployment user: stone
domain: vpn.ruyin.ai
```

当前原型功能：

```text
Nginx + HTTPS 订阅
Xray + VLESS + REALITY + Vision
10 用户 UUID 隔离
Clash / Mihomo YAML 订阅
隐藏订阅路径
B++ 代理规则
Let’s Encrypt 自动续期
配置备份
```

### 3.2 原型目录经验

```text
/srv/vxture/
├── repo/
│   └── deploy/proxy-node/
├── data/
│   ├── nginx/
│   ├── xray/
│   ├── letsencrypt/
│   ├── certbot/
│   └── private/
└── backup/
```

Umbra 项目应继承该分离原则：

```text
repo   = 项目代码、模板、脚本
data   = 真实运行配置、证书、订阅、私有映射、日志
backup = 可恢复快照
```

---

## 4. 部署模式设计

Umbra 应支持两种部署模式。

---

### 4.1 Simple Mode：稳定简化模式

用于快速部署当前已验证结构。

公网端口：

```text
80   → Nginx HTTP / ACME / HTTP to HTTPS redirect
443  → Nginx HTTPS subscription service
8443 → Xray REALITY
```

结构：

```text
Client subscription:
https://vpn.ruyin.ai/sub/<hidden-path>

Proxy connection:
vpn.ruyin.ai:8443
VLESS + REALITY + Vision
```

优点：

```text
配置简单
容易排错
已经原型验证可用
适合快速启动
```

缺点：

```text
Xray REALITY 不在 443
Xray 会出现 non-443 warning
```

---

### 4.2 Edge Mode：目标统一入口模式

长期目标模式。

公网端口：

```text
80  → Nginx HTTP / ACME / redirect
443 → Unified Edge Entry with SNI routing
```

内部服务端口示例：

```text
127.0.0.1:10443 → Xray REALITY
127.0.0.1:9443  → HTTPS subscription service
127.0.0.1:9444  → backend reverse proxy
```

SNI 分流逻辑：

```text
SNI = www.microsoft.com → Xray REALITY
SNI = vpn.ruyin.ai      → Subscription Nginx
SNI = ruyin.ai          → Backend business service
SNI = www.ruyin.ai      → Backend business service
SNI = vault.ruyin.ai    → Backend service or vault service
```

目标效果：

```text
https://vpn.ruyin.ai/sub/<hidden-path> → 订阅
vless://...@vpn.ruyin.ai:443           → 代理
https://ruyin.ai                       → 后端业务
https://vault.ruyin.ai                 → 后端业务或管理服务
```

优点：

```text
公网只暴露标准 443
Xray REALITY 使用推荐形态
订阅和代理都走 443
可扩展后端业务反代
符合边缘入口项目定位
```

缺点：

```text
配置复杂
需要谨慎验证 SNI 分流
需要明确证书和后端服务规划
```

---

## 5. 推荐服务器目录结构

服务器目录保持固定。

```text
/srv/vxture/
├── repo/
│   └── umbra/
├── data/
│   └── umbra/
│       ├── nginx/
│       │   ├── conf.d/
│       │   ├── stream.d/
│       │   ├── html/
│       │   │   └── sub/
│       │   └── logs/
│       ├── xray/
│       │   ├── config.json
│       │   └── logs/
│       ├── letsencrypt/
│       ├── certbot/
│       ├── private/
│       │   ├── users.json
│       │   ├── reality.json
│       │   └── subscription-map.txt
│       └── runtime/
└── backup/
    └── umbra/
```

### 5.1 目录说明

#### `/srv/vxture/repo/umbra`

项目代码目录。

包含：

```text
docker-compose.yml
.env.example
configs/
scripts/
docs/
README.md
```

#### `/srv/vxture/data/umbra`

持久化运行数据目录。

包含真实配置、证书、订阅、私有映射、日志。

#### `/srv/vxture/backup/umbra`

配置备份目录。

备份文件必须限制权限：

```text
backup directory: 700
backup files:     600
```

---

## 6. Git 仓库结构设计

推荐仓库结构：

```text
umbra/
├── README.md
├── .gitignore
├── .env.example
├── docker-compose.yml
├── configs/
│   ├── nginx/
│   │   ├── simple/
│   │   │   └── default.conf.template
│   │   ├── edge/
│   │   │   ├── stream.conf.template
│   │   │   └── subscription.conf.template
│   │   └── snippets/
│   │       ├── ssl.conf.template
│   │       └── proxy-headers.conf.template
│   ├── xray/
│   │   └── config.json.template
│   └── clash/
│       └── subscription.yaml.template
├── scripts/
│   ├── lib/
│   │   ├── env.sh
│   │   ├── log.sh
│   │   ├── render.py
│   │   └── utils.py
│   ├── 00-check-env.sh
│   ├── 01-init-dirs.sh
│   ├── 02-generate-reality.sh
│   ├── 03-generate-users.py
│   ├── 04-render-configs.py
│   ├── 05-issue-cert.sh
│   ├── 06-up.sh
│   ├── 07-verify.sh
│   ├── 08-backup.sh
│   ├── renew-cert.sh
│   ├── list-users.sh
│   └── deploy-all.sh
├── docs/
│   ├── DESIGN.md
│   ├── DEPLOYMENT.md
│   ├── MIGRATION.md
│   ├── ROLLBACK.md
│   ├── SECURITY.md
│   └── OPERATIONS.md
└── tests/
    ├── test-render-configs.py
    └── fixtures/
```

---

## 7. `.env` 配置设计

### 7.1 `.env.example`

```env
# Basic
PROJECT_NAME=umbra
DEPLOY_MODE=simple

# Domain
EDGE_DOMAIN=vpn.ruyin.ai
NODE_NAME=vx-tokyo

# Paths
ROOT_DIR=/srv/vxture
REPO_DIR=/srv/vxture/repo/umbra
DATA_DIR=/srv/vxture/data/umbra
BACKUP_DIR=/srv/vxture/backup/umbra

# Nginx
NGINX_CONTAINER=umbra-nginx
NGINX_HTTP_PORT=80
NGINX_HTTPS_PORT=443
SUB_PATH_PREFIX=/sub

# Xray
XRAY_CONTAINER=umbra-xray
XRAY_IMAGE=teddysun/xray:latest
XRAY_PUBLIC_PORT=8443
XRAY_INTERNAL_PORT=10443
XRAY_PROTOCOL=vless
XRAY_NETWORK=tcp
XRAY_FLOW=xtls-rprx-vision

# REALITY
REALITY_DEST=www.microsoft.com:443
REALITY_SNI=www.microsoft.com
REALITY_SHORT_ID_LENGTH=16

# Users
USER_COUNT=10
USER_PREFIX=user

# Certbot
CERTBOT_EMAIL=
CERTBOT_REGISTER_UNSAFELY_WITHOUT_EMAIL=true
CERT_RENEW_HOUR=3
CERT_RENEW_MINUTE=17

# Backend routing, optional
BACKEND_RUYIN_URL=
BACKEND_WWW_RUYIN_URL=
BACKEND_VAULT_URL=
```

### 7.2 `.env` 规则

`.env` 不允许提交到 Git。

`.env.example` 只保存默认占位变量。

敏感真实数据必须存储在：

```text
/srv/vxture/data/umbra/private/
```

---

## 8. 敏感数据设计

### 8.1 不允许进入 Git 的内容

```text
.env
Reality PrivateKey
Reality PublicKey
用户 UUID
订阅隐藏路径
订阅文件
Let’s Encrypt 证书
Certbot account key
Xray 真实 config.json
Nginx 真实证书路径配置中的私钥文件
备份包
日志
```

### 8.2 私有文件设计

#### `private/reality.json`

```json
{
  "private_key": "generated-private-key",
  "public_key": "generated-public-key",
  "short_id": "generated-short-id",
  "dest": "www.microsoft.com:443",
  "sni": "www.microsoft.com"
}
```

#### `private/users.json`

```json
[
  {
    "user": "user01",
    "uuid": "generated-uuid",
    "subscription_file": "user01-randomtoken",
    "subscription_url": "https://vpn.ruyin.ai/sub/user01-randomtoken",
    "node_name": "vx-tokyo"
  }
]
```

#### `private/subscription-map.txt`

```text
user01: https://vpn.ruyin.ai/sub/user01-randomtoken
user02: https://vpn.ruyin.ai/sub/user02-randomtoken
...
```

权限要求：

```bash
chmod 700 /srv/vxture/data/umbra/private
chmod 600 /srv/vxture/data/umbra/private/*
```

---

## 9. Docker Compose 设计

### 9.1 Simple Mode 服务

```text
umbra-nginx
umbra-xray
```

`umbra-nginx`：

```text
ports:
  - 80:80
  - 443:443

volumes:
  - data nginx conf
  - data nginx html
  - letsencrypt
```

`umbra-xray`：

```text
ports:
  - 8443:8443

volumes:
  - data xray config
```

### 9.2 Edge Mode 服务

推荐服务：

```text
umbra-edge
umbra-subscription
umbra-xray
```

或保持单 Nginx 容器，但启用 stream + http 双配置。

公网：

```text
80:80
443:443
```

内部：

```text
xray:10443
subscription-nginx:9443
backend services
```

---

## 10. Xray 配置模板设计

Xray 应基于模板渲染。

模板来源：

```text
configs/xray/config.json.template
```

输出到：

```text
/srv/vxture/data/umbra/xray/config.json
```

关键结构：

```json
{
  "log": {
    "loglevel": "warning"
  },
  "inbounds": [
    {
      "tag": "vless-reality-in",
      "port": "{{ XRAY_LISTEN_PORT }}",
      "protocol": "vless",
      "settings": {
        "clients": "{{ CLIENTS }}",
        "decryption": "none"
      },
      "streamSettings": {
        "network": "tcp",
        "security": "reality",
        "realitySettings": {
          "show": false,
          "dest": "{{ REALITY_DEST }}",
          "xver": 0,
          "serverNames": [
            "{{ REALITY_SNI }}"
          ],
          "privateKey": "{{ REALITY_PRIVATE_KEY }}",
          "shortIds": [
            "{{ REALITY_SHORT_ID }}"
          ]
        }
      }
    }
  ],
  "outbounds": [
    {
      "tag": "direct",
      "protocol": "freedom"
    },
    {
      "tag": "block",
      "protocol": "blackhole"
    }
  ]
}
```

### 10.1 用户 client 结构

```json
{
  "id": "uuid",
  "email": "user01@vpn.ruyin.ai",
  "flow": "xtls-rprx-vision"
}
```

---

## 11. Clash / Mihomo 订阅设计

### 11.1 订阅文件原则

每个用户一个订阅文件。

每个文件只有一个节点：

```text
vx-tokyo
```

所有用户策略完全一致。

唯一差异：

```text
UUID
订阅 URL
```

### 11.2 订阅路径策略

不使用可枚举简单路径：

```text
/sub/user01
/sub/user02
```

使用隐藏路径：

```text
/sub/user01-<random-token>
/sub/user02-<random-token>
```

不要把 UUID 放进 URL 后缀。

原因：

```text
UUID 是认证凭据。
URL 会进入 Nginx 日志、浏览器历史、客户端日志。
不应暴露 UUID。
```

### 11.3 节点名

统一：

```text
vx-tokyo
```

不暴露：

```text
vxture-worker-03-user02
真实服务器名
真实用户编号
```

---

## 12. B++ 代理规则策略

所有用户订阅使用统一 B++ 策略。

### 12.1 策略原则

```text
自身订阅域名直连
本地 / 局域网 / fake-ip 直连
AI 大模型服务强制代理
OpenRouter 和模型平台强制代理
Figma 强制代理
GitHub / Docker / npm 强制代理
Microsoft / VSCode / OneDrive 不强制代理
Cloudflare 不强制代理
国内 IP 直连
未知流量代理兜底
```

### 12.2 规则模板

```yaml
rules:
  # 0. 自身订阅域名直连
  - DOMAIN-SUFFIX,{{ EDGE_DOMAIN }},DIRECT

  # 1. 本地 / 局域网 / fake-ip 直连
  - IP-CIDR,127.0.0.0/8,DIRECT,no-resolve
  - IP-CIDR,10.0.0.0/8,DIRECT,no-resolve
  - IP-CIDR,172.16.0.0/12,DIRECT,no-resolve
  - IP-CIDR,192.168.0.0/16,DIRECT,no-resolve
  - IP-CIDR,169.254.0.0/16,DIRECT,no-resolve
  - IP-CIDR,198.18.0.0/15,DIRECT,no-resolve

  # 2. AI 大模型服务
  - DOMAIN-SUFFIX,openai.com,PROXY
  - DOMAIN-SUFFIX,chatgpt.com,PROXY
  - DOMAIN-SUFFIX,oaistatic.com,PROXY
  - DOMAIN-SUFFIX,oaiusercontent.com,PROXY
  - DOMAIN-SUFFIX,ai.com,PROXY
  - DOMAIN-SUFFIX,anthropic.com,PROXY
  - DOMAIN-SUFFIX,claude.ai,PROXY
  - DOMAIN-SUFFIX,gemini.google.com,PROXY
  - DOMAIN-SUFFIX,aistudio.google.com,PROXY
  - DOMAIN-SUFFIX,generativelanguage.googleapis.com,PROXY
  - DOMAIN-SUFFIX,x.ai,PROXY
  - DOMAIN-SUFFIX,api.x.ai,PROXY
  - DOMAIN-SUFFIX,perplexity.ai,PROXY
  - DOMAIN-SUFFIX,mistral.ai,PROXY
  - DOMAIN-SUFFIX,api.mistral.ai,PROXY
  - DOMAIN-SUFFIX,groq.com,PROXY
  - DOMAIN-SUFFIX,groqcloud.com,PROXY
  - DOMAIN-SUFFIX,api.groq.com,PROXY
  - DOMAIN-SUFFIX,deepseek.com,PROXY
  - DOMAIN-SUFFIX,deepseek.ai,PROXY
  - DOMAIN-SUFFIX,api.deepseek.com,PROXY
  - DOMAIN-SUFFIX,openrouter.ai,PROXY

  # 3. 模型聚合 / 免费模型平台
  - DOMAIN-SUFFIX,huggingface.co,PROXY
  - DOMAIN-SUFFIX,hf.co,PROXY
  - DOMAIN-SUFFIX,replicate.com,PROXY
  - DOMAIN-SUFFIX,together.ai,PROXY
  - DOMAIN-SUFFIX,fireworks.ai,PROXY
  - DOMAIN-SUFFIX,poe.com,PROXY

  # 4. Figma / 设计工具
  - DOMAIN-SUFFIX,figma.com,PROXY
  - DOMAIN-SUFFIX,figma.site,PROXY
  - DOMAIN-SUFFIX,figma.app,PROXY
  - DOMAIN-SUFFIX,makeproxy-c.figma.site,PROXY
  - DOMAIN-SUFFIX,makeproxy-m.figma.site,PROXY
  - DOMAIN-SUFFIX,jsdelivr.net,PROXY
  - DOMAIN-SUFFIX,esm.sh,PROXY

  # 5. 开发工具链：GitHub / Docker / npm
  - DOMAIN-SUFFIX,github.com,PROXY
  - DOMAIN-SUFFIX,githubusercontent.com,PROXY
  - DOMAIN-SUFFIX,githubassets.com,PROXY
  - DOMAIN-SUFFIX,github.io,PROXY
  - DOMAIN-SUFFIX,ghcr.io,PROXY
  - DOMAIN-SUFFIX,docker.com,PROXY
  - DOMAIN-SUFFIX,docker.io,PROXY
  - DOMAIN-SUFFIX,registry-1.docker.io,PROXY
  - DOMAIN-SUFFIX,npmjs.org,PROXY
  - DOMAIN-SUFFIX,npmjs.com,PROXY
  - DOMAIN-SUFFIX,pnpm.io,PROXY
  - DOMAIN-SUFFIX,nodejs.org,PROXY

  # 6. 国外社交 / 通讯
  - DOMAIN-SUFFIX,reddit.com,PROXY
  - DOMAIN-SUFFIX,x.com,PROXY
  - DOMAIN-SUFFIX,twitter.com,PROXY
  - DOMAIN-SUFFIX,telegram.org,PROXY
  - DOMAIN-SUFFIX,t.me,PROXY
  - DOMAIN-SUFFIX,discord.com,PROXY
  - DOMAIN-SUFFIX,medium.com,PROXY

  # 7. 国内 IP 直连
  - GEOIP,CN,DIRECT

  # 8. 兜底代理
  - MATCH,PROXY
```

---

## 13. Nginx 配置设计

### 13.1 Simple Mode Nginx

负责：

```text
HTTP 80
HTTPS 443
ACME challenge
HTTP to HTTPS redirect
/sub/ 静态订阅文件
```

关键配置：

```nginx
server {
    listen 80;
    server_name {{ EDGE_DOMAIN }};

    location /.well-known/acme-challenge/ {
        root /usr/share/nginx/html;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name {{ EDGE_DOMAIN }};

    ssl_certificate /etc/letsencrypt/live/{{ EDGE_DOMAIN }}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/{{ EDGE_DOMAIN }}/privkey.pem;

    root /usr/share/nginx/html;
    index index.html;

    location /sub/ {
        default_type application/yaml;
        try_files $uri =404;
    }

    location / {
        try_files $uri $uri/ =404;
    }
}
```

### 13.2 Edge Mode Nginx Stream

目标：

```text
公网 443 根据 SNI 转发到 Xray / subscription / backend
```

示例逻辑：

```nginx
stream {
    map $ssl_preread_server_name $backend {
        www.microsoft.com xray_backend;
        vpn.ruyin.ai subscription_backend;
        ruyin.ai business_backend;
        www.ruyin.ai business_backend;
        vault.ruyin.ai vault_backend;
        default subscription_backend;
    }

    upstream xray_backend {
        server umbra-xray:10443;
    }

    upstream subscription_backend {
        server umbra-subscription:9443;
    }

    upstream business_backend {
        server backend.example.internal:443;
    }

    upstream vault_backend {
        server vault.example.internal:443;
    }

    server {
        listen 443;
        proxy_pass $backend;
        ssl_preread on;
    }
}
```

---

## 14. 证书设计

### 14.1 签发方式

默认使用 Certbot webroot。

目录：

```text
/srv/vxture/data/umbra/letsencrypt
/srv/vxture/data/umbra/certbot
```

签发命令由脚本封装：

```text
scripts/05-issue-cert.sh
```

### 14.2 自动续期

脚本：

```text
scripts/renew-cert.sh
```

cron 示例：

```cron
17 3 * * * /srv/vxture/repo/umbra/scripts/renew-cert.sh >> /var/log/umbra-cert-renew.log 2>&1
```

### 14.3 续期逻辑

```text
每天执行检查
证书未接近过期，不续期
证书接近过期，自动续期
续期完成后 reload Nginx
```

---

## 15. 脚本设计

所有脚本应具备：

```text
幂等性
清晰输出
失败即停止
可单独执行
可被 deploy-all 调用
```

### 15.1 `00-check-env.sh`

检查：

```text
.env 是否存在
必须变量是否存在
Docker 是否可用
Docker Compose 是否可用
当前用户是否有 docker 权限
域名是否解析到当前公网 IP
端口是否被占用
```

### 15.2 `01-init-dirs.sh`

创建目录：

```text
DATA_DIR
nginx
xray
letsencrypt
certbot
private
logs
backup
```

设置权限：

```text
private: 700
backup: 700
```

### 15.3 `02-generate-reality.sh`

生成：

```text
Reality PrivateKey
Reality PublicKey
shortId
```

保存到：

```text
DATA_DIR/private/reality.json
```

如果文件已存在，默认不覆盖。

### 15.4 `03-generate-users.py`

生成：

```text
user01-user10
UUID
hidden subscription file name
subscription URL
```

保存到：

```text
DATA_DIR/private/users.json
DATA_DIR/private/subscription-map.txt
```

如果用户文件已存在，默认不覆盖，避免破坏已有订阅。

### 15.5 `04-render-configs.py`

渲染：

```text
Xray config.json
Nginx config
Clash subscription files
docker-compose.override if needed
```

输出到：

```text
DATA_DIR/xray/config.json
DATA_DIR/nginx/conf.d/
DATA_DIR/nginx/html/sub/
```

### 15.6 `05-issue-cert.sh`

签发证书。

必须保证：

```text
Nginx HTTP 80 可用于 ACME challenge
证书路径正确
失败时输出明确错误
```

### 15.7 `06-up.sh`

启动服务：

```bash
docker compose up -d
```

### 15.8 `07-verify.sh`

验证：

```text
docker compose ps
HTTPS 订阅 200
所有订阅 URL 200
旧可枚举路径 404
Xray 端口 open
Xray 配置 test OK
订阅内容包含 vx-tokyo
订阅内容包含 B++ 关键规则
订阅内容不包含 microsoft.com 强制代理
```

### 15.9 `08-backup.sh`

备份：

```text
repo deployment files
nginx data
xray config
letsencrypt
certbot
private
crontab
```

备份文件：

```text
BACKUP_DIR/umbra-config-<timestamp>.tar.gz
BACKUP_DIR/root-crontab-<timestamp>.txt
```

权限：

```text
backup dir: 700
backup files: 600
```

### 15.10 `deploy-all.sh`

按顺序执行：

```text
00-check-env
01-init-dirs
02-generate-reality
03-generate-users
04-render-configs
05-issue-cert
06-up
07-verify
08-backup
```

支持参数：

```bash
bash scripts/deploy-all.sh
bash scripts/deploy-all.sh --mode simple
bash scripts/deploy-all.sh --mode edge
```

---

## 16. 验证标准

### 16.1 服务验证

```bash
docker compose ps
```

期望：

```text
umbra-nginx  running
umbra-xray   running
```

### 16.2 HTTPS 订阅验证

```bash
curl -I https://vpn.ruyin.ai/sub/<hidden-path>
```

期望：

```text
HTTP/1.1 200 OK
Content-Type: application/yaml
```

### 16.3 Xray 端口验证

Simple Mode：

```bash
timeout 5 bash -c '</dev/tcp/vpn.ruyin.ai/8443' && echo "xray open" || echo "xray closed"
```

Edge Mode：

```bash
timeout 5 bash -c '</dev/tcp/vpn.ruyin.ai/443' && echo "edge 443 open" || echo "edge 443 closed"
```

### 16.4 订阅内容验证

每个订阅文件必须包含：

```text
name: vx-tokyo
DOMAIN-SUFFIX,vpn.ruyin.ai,DIRECT
DOMAIN-SUFFIX,openai.com,PROXY
DOMAIN-SUFFIX,figma.com,PROXY
MATCH,PROXY
```

不得包含：

```text
DOMAIN-SUFFIX,microsoft.com,PROXY
```

### 16.5 用户数量验证

```text
client_count = USER_COUNT
```

---

## 17. 运维设计

### 17.1 日志

初始版本只保留必要日志。

后续可扩展：

```text
Xray access log
Xray error log
Nginx subscription access log
Nginx error log
```

日志目录：

```text
DATA_DIR/nginx/logs
DATA_DIR/xray/logs
```

必须配套 logrotate，防止磁盘被日志占满。

### 17.2 用户管理

后续可增加：

```text
add-user.sh
disable-user.sh
delete-user.sh
regen-sub.sh
list-users.sh
```

原则：

```text
新增用户不影响旧用户
禁用用户不删除历史记录
订阅路径变更必须更新 private mapping
每次变更后自动备份
```

### 17.3 迁移

迁移步骤：

```text
1. 新开 VPS
2. 安装 Docker / Compose
3. clone vxture/umbra
4. 配置 .env
5. deploy-all
6. 用临时域名验证
7. 切换正式 DNS
8. 客户端更新订阅
9. 观察 24-72 小时
10. 销毁旧 VPS
```

### 17.4 回滚

回滚来源：

```text
BACKUP_DIR/*.tar.gz
```

回滚原则：

```text
先停服务
恢复 data
恢复 crontab
启动服务
执行 verify
```

---

## 18. 安全规范

### 18.1 Git 安全

必须忽略：

```gitignore
.env
*.env
.env.*
!.env.example

data/
backup/
private/
runtime/
generated/

*.pem
*.key
*.crt
*.csr
*.p12
*.pfx

*.log
logs/

__pycache__/
*.pyc
.venv/
venv/

.DS_Store
.vscode/
```

### 18.2 订阅安全

```text
不使用可枚举路径
不在路径中使用 UUID
私有映射不放公网目录
订阅文件只放必要配置
节点名不暴露服务器名
```

### 18.3 服务器安全

```text
只开放必要端口
优先使用非 root 部署用户
证书和 private 目录限制权限
备份文件限制权限
敏感文件不复制到公开目录
```

---

## 19. 第一版里程碑

### v0.1 Simple Mode

目标：

```text
复刻并固化当前 vxture-worker-03 成功配置
```

包含：

```text
docker-compose
Nginx HTTPS subscription
Xray REALITY 8443
10 users
hidden subscription paths
B++ rules
certbot renew
backup
verify
```

### v0.2 Edge Mode

目标：

```text
统一入口 443 + SNI 分流
```

包含：

```text
Nginx stream
Xray internal 10443
subscription internal 9443
backend routing placeholders
```

### v0.3 User Management

目标：

```text
脚本化用户管理
```

包含：

```text
add / disable / delete / list / regenerate subscription
```

### v0.4 Observability

目标：

```text
日志、使用量统计、健康检查
```

包含：

```text
access log
error log
logrotate
basic traffic statistics
```

---

## 20. Codex 构建要求

Codex 在构建项目时应遵循以下规则：

1. 以本文档为最高设计依据。
2. 先实现 `v0.1 Simple Mode`。
3. 不要直接实现所有未来能力。
4. 所有脚本必须可单独执行。
5. 所有脚本必须尽量幂等。
6. 所有敏感数据必须输出到 `DATA_DIR/private`。
7. `.env.example` 不包含真实 secret。
8. 生成的配置文件必须和当前原型能力一致。
9. 订阅规则必须使用 B++ 策略。
10. 订阅路径必须为隐藏随机路径。
11. 节点名必须默认为 `vx-tokyo`。
12. 不允许把 Microsoft / VSCode / OneDrive 强制代理。
13. 不允许把 Cloudflare 强制代理。
14. 每次部署完成必须执行 verify。
15. 每次部署成功必须执行 backup。
16. 文档和脚本必须同步维护。

---

## 21. 当前待决策事项

```text
1. v0.1 是否只做 Simple Mode
2. v0.2 Edge Mode 的 SNI 分流实现方式
3. 是否增加访问日志 / 使用量统计
4. 是否增加防火墙规则
5. 是否增加监控
6. 是否增加用户管理脚本
7. 是否接入后端业务机反代
8. 是否配置 GitHub Actions 做静态检查
```

---

## 22. 当前推荐下一步

第一步：

```text
在 GitHub 创建私有仓库：
vxture/umbra
```

第二步：

```text
在 VSCode clone 仓库。
```

第三步：

```text
创建 docs/DESIGN.md，并放入本文档。
```

第四步：

```text
让 Codex 根据本文档生成 v0.1 Simple Mode 项目骨架。
```

第五步：

```text
在新 VPS 上测试 deploy-all。
```

---

## 23. 项目成功标准

Umbra v0.1 成功标准：

```text
1. 新 VPS 上可以通过 deploy-all 完整部署。
2. Nginx 和 Xray 容器正常运行。
3. HTTPS 订阅可以访问。
4. user01-user10 自动生成。
5. 每个用户独立 UUID。
6. 每个用户隐藏订阅路径。
7. Clash Verge 可以导入订阅。
8. 节点名显示 vx-tokyo。
9. B++ 规则正确。
10. user01 至少实测可用。
11. 证书自动续期配置成功。
12. 配置备份生成成功。
13. 敏感文件未进入 Git。
```

---

## 24. 维护原则

```text
先稳定，再复杂。
先脚本化，再自动化。
先可验证，再可迁移。
先保护业务机，再优化入口节点。
```

Umbra 是可替换的影子入口。

业务核心应该稳定在后方。

入口出问题时，重新生成一个 Umbra 节点，而不是抢救旧节点到天亮。
