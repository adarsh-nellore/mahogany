"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/feed";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Sign in failed");
        setLoading(false);
        return;
      }
      const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/feed";
      router.push(safeNext);
    } catch (err) {
      setError(String(err));
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--color-bg)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <header className="topbar" style={{ position: "sticky", top: 0, zIndex: 50 }}>
        <Link href="/" className="topbar-brand" style={{ textDecoration: "none" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand-mark.png"
            alt=""
            aria-hidden="true"
            width={32}
            height={32}
            style={{ flexShrink: 0, objectFit: "contain" }}
          />
          Mahogany
        </Link>
        <div style={{ flex: 1 }} />
        <Link href="/signup" className="btn btn-ghost btn-sm" style={{ color: "var(--color-fg-muted)" }}>
          Sign up
        </Link>
      </header>

      {/* Form */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "var(--space-6)",
        }}
      >
        <div
          style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-xl)",
            padding: "var(--space-8)",
            width: "100%",
            maxWidth: 400,
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <h1
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "var(--text-2xl)",
              fontWeight: "var(--weight-bold)",
              color: "var(--color-fg)",
              marginBottom: "var(--space-2)",
            }}
          >
            Welcome back
          </h1>
          <p
            style={{
              fontSize: "var(--text-sm)",
              color: "var(--color-fg-muted)",
              marginBottom: "var(--space-6)",
              fontFamily: "var(--font-sans)",
            }}
          >
            Sign in to your Mahogany account
          </p>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
            <div className="form-group">
              <label className="form-label" htmlFor="email">Email</label>
              <input
                id="email"
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="password">Password</label>
              <input
                id="password"
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <p
                style={{
                  fontSize: "var(--text-xs)",
                  color: "var(--color-danger)",
                  margin: 0,
                  fontFamily: "var(--font-sans)",
                }}
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-md"
              disabled={loading}
              style={{ width: "100%", marginTop: "var(--space-2)" }}
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p
            style={{
              textAlign: "center",
              fontSize: "var(--text-sm)",
              color: "var(--color-fg-muted)",
              marginTop: "var(--space-5)",
              fontFamily: "var(--font-sans)",
            }}
          >
            Don&apos;t have an account?{" "}
            <Link
              href="/signup"
              style={{ color: "var(--color-primary)", textDecoration: "none", fontWeight: 600 }}
            >
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "var(--color-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-muted)" }}>Loading…</div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
