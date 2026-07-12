---
name: vxture-access-requires-authorization
description: Any vxture access (even read-only) requires explicit per-time user authorization; default to umbra-only
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 03a76e6a-6260-4afc-b2d0-8e515c19ebee
---

When working from the umbra repo, ANY interaction with the vxture repo requires
explicit user authorization first - this includes read-only actions (Read/Grep
on D:\MyWebSite\vxture, `gh` queries against vxture/vxture, browsing its source).
Not just writes/PRs/merges/promotes/deploys. Default scope is umbra-only.

**Why:** User set this boundary explicitly on 2026-06-24 ("你的权限收紧，读取
vxture 也需要我的授权"). vxture is a separate project; the local checkout at
D:\MyWebSite\vxture and the shared `gh` login (acct stonesmoker) make it
technically reachable, but reachability is not permission.

**How to apply:** Stay within umbra by default. Before touching vxture for any
reason, ask and wait for a yes. This is stricter than vxture's own G6 rule
(which gates only commits/pushes/PRs/merges/CI); here even analysis is gated.
See [[project-overview]], [[portal-redesign]] (vxture ref repo location).
