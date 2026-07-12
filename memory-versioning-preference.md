---
name: memory-versioning-preference
description: "How the user wants Claude's memory store versioned and pushed"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: a24b8b4e-44c5-4c64-bea4-f7f29f002361
---

The user wants the Claude memory store versioned **inside the existing
`vxture/vxture-Umbra` GitHub repo**, not in a separate/new repository. Goal: full
version unification with local and remote in exact agreement.

**Why:** they treat a consistent, single-remote repo as the foundation for
ongoing development; spinning up a standalone repo for memory was explicitly
rejected ("要创建新repo？").

**How to apply:** the memory folder at
`~/.claude/projects/D--MyWebSite-vxturestudio-umbra/memory/` is its own git repo
(it must stay at that path for the memory feature to read it). Point its
`origin` at `https://github.com/vxture/vxture-Umbra.git` and push to a dedicated branch
`claude-memory`. Keep local branch == `origin/claude-memory`. Never propose
creating a new standalone GitHub repo for memory. See [[cicd-deploy-flow]] for
the project's main-repo branch rules.

**Two synced locations** (every memory edit should reach both):
1. **Live store** `~/.claude/.../memory/` -> git repo on branch `claude-memory`
   of `vxture/vxture-Umbra`. This is what the memory feature reads.
2. **Docs mirror** `docs/memory/` in the umbra working tree, on `develop`/`main`.
   Human-readable, indexed by `docs/agent.md`. This is the project-facing copy.

**Sync flow when memory changes:**
1. Edit/add the file in the live store, then in that folder:
   `git add -A && git commit && git push origin claude-memory`
   (also update `MEMORY.md` index there).
2. Mirror the same change into `docs/memory/<name>.md` and, if new, add a row to
   the `docs/agent.md` Document Map. Mirrors must be **ASCII English** (build
   constraint #13 / CI `Static script checks`), use repo-relative links, and keep
   the header note pointing to the authoritative `specs/`/`design/`/`operations/`
   doc ("authoritative doc wins").
3. The `docs/memory/` change ships through the normal branch flow: feature branch
   off `origin/develop` -> PR -> CI -> squash-merge -> promote to `main`
   (see [[cicd-deploy-flow]]). Never edit `docs/memory/` directly on `develop`/`main`.

Mirror files carry a "(memory mirror)" title suffix and a blockquote header naming
the source memory. The live-store files keep YAML frontmatter; the docs mirrors
drop it in favor of a `#` title to match repo doc style.
