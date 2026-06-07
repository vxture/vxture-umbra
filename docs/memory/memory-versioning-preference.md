# Memory Versioning Preference (memory mirror)

> Mirror of memory `memory-versioning-preference` (type: feedback). Describes how
> the maintainer wants Claude's memory store versioned.

The Claude memory store is versioned **inside the existing `vxture/umbra` GitHub
repo**, not in a separate or new repository. Goal: full version unification with
local and remote in exact agreement.

**Why:** the maintainer treats a consistent, single-remote repo as the foundation
for ongoing development; spinning up a standalone repo for memory was explicitly
rejected.

**How to apply:**
- The live memory folder at
  `~/.claude/projects/D--MyWebSite-vxturestudio-umbra/memory/` is its own git repo
  (it must stay at that path so the memory feature can read it).
- Its `origin` points at `https://github.com/vxture/umbra.git`, pushed to the
  dedicated `claude-memory` branch; local branch tracks `origin/claude-memory`.
- This [`docs/memory/`](README.md) tree is the human-readable mirror that travels
  with the codebase on `develop`/`main`.
- Never propose creating a new standalone GitHub repo for memory.

See [`cicd-deploy-flow.md`](cicd-deploy-flow.md) for the main-repo branch rules.
