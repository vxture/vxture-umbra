"use client";

import type { ReactNode } from "react";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/">
          <img
            className="brand-mark"
            src="/assets/brand/ruyin-symbol-dark.png"
            alt="Ruyin"
            width={28}
            height={28}
          />
          <span>
            <strong className="brand-title">Ruyin Account</strong>
            <span className="brand-subtitle">Private VPN access</span>
          </span>
        </a>
        <nav className="actions">
          <a className="btn btn-secondary" href="/">
            Apps
          </a>
          <a className="btn btn-secondary" href="/invites">
            Invites
          </a>
        </nav>
      </header>
      {children}
    </main>
  );
}

export function PageHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <header className="page-header">
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}

export function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <article className="metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
    </article>
  );
}
