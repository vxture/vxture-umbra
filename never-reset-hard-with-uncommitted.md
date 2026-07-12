---
name: never-reset-hard-with-uncommitted
description: Never git reset --hard while uncommitted/unstaged changes exist in the working tree
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 38750d62-0a46-45ff-8a3e-8cc276881788
---

Before `git reset --hard`, `git checkout -- .`, or `git switch` that could clobber
files, ALWAYS run `git status` and confirm the working tree has no uncommitted
changes you didn't make. If there are any, `git stash -u` first (or commit), then
reset, then `git stash pop`.

**Why:** CLAUDE.md suggests `git reset --hard origin/main` to realign local
branches - a habit trap. On 2026-06-12, after merging PR #60, I ran
`git reset --hard origin/develop` while the user had uncommitted manual edits to
`portals/website/app/page.tsx` + `globals.css` (the "Virtual Nature Studio" ->
"Vxture Studio" studio-name fix they were keeping separate from the PR). The
reset wiped them. Unstaged changes are NOT in git's object store, so git could
not recover them (dangling blobs were only old historical versions).

**How to apply:** Recovered via VS Code Local History at
`%APPDATA%\Code\User\History` - each folder has `entries.json` mapping a hashed
dir to the file's `resource` URI, with timestamped snapshot files; the newest
snapshot was the user's lost edit. That is the fallback when uncommitted work is
destroyed. But the rule is: stash before any destructive git op when the tree is
dirty with work that isn't mine. Related: this session shipped console+admin via
PR #60; website edits stay the user's separate WIP - [[console-ds-frame-coupling]].
