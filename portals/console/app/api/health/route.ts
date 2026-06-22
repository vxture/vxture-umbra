// Liveness endpoint for the container healthcheck. The handler is shared via the
// @umbra/shared workspace package; the route segment config stays here so
// Next.js detects it statically.
export { GET } from "@umbra/shared/health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
