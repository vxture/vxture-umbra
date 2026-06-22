import { NextResponse } from "next/server";

// Shared liveness handler for every portal's /api/health route. As a workspace
// package it resolves the hoisted node_modules, so unlike the retired
// build-context approach it CAN import next/react. This is the mechanism that
// will carry the real shared app-shell modules (providers, locale-provider) in
// P1b. No external dependencies keeps the endpoint green as long as the server
// is serving.
export function GET() {
  return NextResponse.json({ status: "ok" });
}
