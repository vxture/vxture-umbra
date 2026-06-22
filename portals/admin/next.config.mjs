import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Transpile the internal workspace package (raw TS source).
  transpilePackages: ["@umbra/shared"],
  // Trace from the workspace root so standalone output includes the hoisted
  // node_modules and the shared package (monorepo standalone pattern).
  outputFileTracingRoot: path.join(__dirname, ".."),
};

export default nextConfig;
