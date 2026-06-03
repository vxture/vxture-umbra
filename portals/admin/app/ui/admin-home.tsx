export function AdminHome() {
  return (
    <div className="admin-page">
      <header className="admin-header">
        <img
          className="admin-brand-mark"
          src="/assets/brand/ruyin-symbol-dark.png"
          alt="Ruyin"
          width={36}
          height={36}
        />
        <div>
          <h1 className="admin-title">Ruyin Admin</h1>
          <p className="admin-subtitle">Platform management console</p>
        </div>
      </header>

      <main className="admin-cards">
        {/* --- VPN Management Card --- */}
        <a
          className="admin-card"
          href="/dashboard/"
          target="_blank"
          rel="noopener noreferrer"
        >
          <div className="card-icon card-icon-vpn">
            <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
              <rect x="4" y="16" width="32" height="20" rx="4" stroke="currentColor" strokeWidth="2" fill="none"/>
              <path d="M14 16V12a6 6 0 0 1 12 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="20" cy="26" r="3" fill="currentColor" opacity="0.7"/>
              <path d="M20 29v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <div className="card-body">
            <h2 className="card-title">VPN Management</h2>
            <p className="card-desc">
              Manage users, traffic, and proxy settings via Marzban dashboard.
            </p>
            <span className="card-link">
              Open Marzban &rarr;
            </span>
          </div>
        </a>

        {/* --- Password Management Card --- */}
        <a
          className="admin-card"
          href="https://pass.ruyin.ai/admin"
          target="_blank"
          rel="noopener noreferrer"
        >
          <div className="card-icon card-icon-pass">
            <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
              <rect x="4" y="16" width="32" height="20" rx="4" stroke="currentColor" strokeWidth="2" fill="none"/>
              <path d="M14 16V12a6 6 0 0 1 12 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <path d="M12 28h16M12 32h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <div className="card-body">
            <h2 className="card-title">Password Management</h2>
            <p className="card-desc">
              Manage credentials and shared vaults via Vaultwarden admin panel.
            </p>
            <span className="card-link">
              Open Vaultwarden &rarr;
            </span>
          </div>
        </a>
      </main>

      <footer className="admin-footer">
        <span>Ruyin Admin &middot; vxture studio</span>
      </footer>
    </div>
  );
}
