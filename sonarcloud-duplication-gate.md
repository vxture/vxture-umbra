---
name: sonarcloud-duplication-gate
description: SonarCloud quality gate fails on >3% duplication on new code; automatic analysis ignores repo cpd.exclusions
metadata: 
  node_type: memory
  type: project
  originSessionId: 78383d3c-0837-4b56-a030-877cc9820108
---

The repo runs SonarCloud **Automatic Analysis** (no sonar config in the repo, no CI sonar step). Its quality gate fails a PR when **duplication on new code exceeds 3%**. This check is NOT the required `quality-gate` (that's the GitHub Actions one in [[cicd-deploy-flow]]) and prior PRs (#60/#62/#63) merged past it while it showed neutral/failed - but it is visible and worth keeping green.

**Trap:** adding `sonar-project.properties` with `sonar.cpd.exclusions` does NOT work - Automatic Analysis ignores repo-side exclusions (they only apply via the SonarCloud UI or CI-based analysis). Duplication stayed at exactly the same % after adding it. Fix duplication in CODE, not config.

**Why it bites:** the website/console/admin portals are separate Next.js apps that intentionally mirror chrome (header/footer CSS) AND each historically copied a byte-identical `locale-provider.tsx` (~68 lines). A verbatim copied file = ~100% of itself flagged as new-code duplication. CSS chrome duplication was NOT counted - only the TS clone was.

**Fix applied (2026-06-13, PR #64):** admin dropped its copied `locale-provider.tsx`; it has one locale consumer (header switcher) so it uses a small inline `useAdminLocale` hook in `admin-shell.tsx` instead. Took duplication 14.6% -> 0.0%. If a new portal needs locale, prefer an inline single-consumer hook over copying the console provider. See [[admin-console-separation]] and [[portal-redesign]].

Sonar clean-code rule S6754 also flags `useState` whose setter isn't named `set<Value>` - name the raw setter `setX` and wrap persistence in a differently-named function.
