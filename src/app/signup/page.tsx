"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/sign-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Sign-up failed");
        setLoading(false);
        return;
      }

      if (data.requiresEmailConfirmation) {
        setCheckEmail(true);
        setLoading(false);
        return;
      }

      // Auto sign-in when email confirmation is disabled
      const signInRes = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!signInRes.ok) {
        router.push("/login");
        return;
      }

      router.push("/onboarding");
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
        <Link href="/login" className="btn btn-ghost btn-sm" style={{ color: "var(--color-fg-muted)" }}>
          Log in
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
          {checkEmail ? (
            <>
              <h1
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize: "var(--text-2xl)",
                  fontWeight: "var(--weight-bold)",
                  color: "var(--color-fg)",
                  marginBottom: "var(--space-2)",
                }}
              >
                Check your email
              </h1>
              <p
                style={{
                  fontSize: "var(--text-sm)",
                  color: "var(--color-fg-muted)",
                  marginBottom: "var(--space-6)",
                  fontFamily: "var(--font-sans)",
                  lineHeight: 1.6,
                }}
              >
                We sent a confirmation link to <strong>{email}</strong>. Click the link to verify your account, then you can sign in and complete your profile.
              </p>
              <Link
                href="/login"
                className="btn btn-primary btn-md"
                style={{ width: "100%", textAlign: "center", textDecoration: "none" }}
              >
                Go to sign in
              </Link>
            </>
          ) : (
            <>
              <h1
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize: "var(--text-2xl)",
                  fontWeight: "var(--weight-bold)",
                  color: "var(--color-fg)",
                  marginBottom: "var(--space-2)",
                }}
              >
                Create your account
              </h1>
              <p
                style={{
                  fontSize: "var(--text-sm)",
                  color: "var(--color-fg-muted)",
                  marginBottom: "var(--space-6)",
                  fontFamily: "var(--font-sans)",
                }}
              >
                Set up your Mahogany profile in minutes
              </p>

              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
            <div className="form-group">
              <label className="form-label" htmlFor="name">Full name</label>
              <input
                id="name"
                className="input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Smith"
                required
                autoComplete="name"
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="email">Work email</label>
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
                placeholder="Min. 8 characters"
                required
                minLength={8}
                autoComplete="new-password"
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
              {loading ? "Creating account…" : "Create account"}
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
                Already have an account?{" "}
                <Link
                  href="/login"
                  style={{ color: "var(--color-primary)", textDecoration: "none", fontWeight: 600 }}
                >
                  Log in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
