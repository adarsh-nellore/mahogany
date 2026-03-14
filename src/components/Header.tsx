"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

interface ProfileSnippet {
  name: string;
  email: string;
}

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileSnippet | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/profiles/me")
      .then((r) => (r.ok ? r.json() : null))
      .then(setProfile)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSignOut = async () => {
    setMenuOpen(false);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  };

  const initials = profile
    ? profile.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const isOnboarding = pathname?.startsWith("/onboarding");

  return (
    <header className="topbar" style={{ position: "sticky", top: 0, zIndex: 60 }}>
      <Link href={isOnboarding ? "/" : "/feed"} className="topbar-brand" style={{ textDecoration: "none" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand-mark.png" alt="" aria-hidden="true" width={32} height={32} style={{ flexShrink: 0, objectFit: "contain" }} />
        Mahogany
      </Link>

      {!isOnboarding && (
        <nav className="topbar-nav">
          <Link href="/feed" className={isActive("/feed") ? "active" : ""}>Feed</Link>
          <Link href="/digest" className={isActive("/digest") ? "active" : ""}>Digest</Link>
        </nav>
      )}

      <div style={{ flex: 1 }} />

      {!isOnboarding && (
      <div ref={menuRef} style={{ position: "relative" }}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Account menu"
            style={{
              width: 40, height: 40, borderRadius: "var(--radius-full)",
              background: "var(--color-fg)", color: "var(--color-fg-inverse)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 600, fontFamily: "var(--font-sans)",
              border: "none", cursor: "pointer", letterSpacing: "0.02em",
            }}
          >
            {initials}
          </button>

          {menuOpen && (
            <div style={{
              position: "absolute", right: 0, top: "calc(100% + 8px)",
              width: 220, background: "var(--color-surface)",
              border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-lg)", overflow: "hidden", zIndex: 50,
            }}>
              {profile && (
                <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid var(--color-border)" }}>
                  <p style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-medium)" as unknown as number, color: "var(--color-fg)", margin: 0, lineHeight: "var(--leading-snug)", fontFamily: "var(--font-sans)" }}>
                    {profile.name}
                  </p>
                  <p style={{ fontSize: "var(--text-xs)", color: "var(--color-fg-muted)", margin: 0, marginTop: 2, fontFamily: "var(--font-sans)" }}>
                    {profile.email}
                  </p>
                </div>
              )}

              <div style={{ padding: "4px 0" }}>
                <MenuLink href="/profile" label="Profile" active={isActive("/profile")} onClick={() => setMenuOpen(false)} />
              </div>

              <div style={{ borderTop: "1px solid var(--color-border)", padding: "4px 0" }}>
                <button onClick={handleSignOut}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "8px 14px", fontSize: "var(--text-sm)",
                    color: "var(--color-danger)", background: "none",
                    border: "none", cursor: "pointer", fontFamily: "var(--font-sans)",
                  }}>
                  Sign Out
                </button>
              </div>
            </div>
          )}
      </div>
      )}
    </header>
  );
}

function MenuLink({ href, label, active, onClick }: { href: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <Link href={href} onClick={onClick}
      style={{
        display: "block", padding: "8px 14px", fontSize: "var(--text-sm)",
        color: active ? "var(--color-fg)" : "var(--color-fg-secondary)",
        fontWeight: active ? 500 : 400, textDecoration: "none", fontFamily: "var(--font-sans)",
      }}>
      {label}
    </Link>
  );
}
