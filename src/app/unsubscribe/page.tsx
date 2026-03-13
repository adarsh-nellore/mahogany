"use client";

import { useState } from "react";
import Link from "next/link";

export default function UnsubscribePage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  const handleUnsubscribe = async () => {
    if (!email.includes("@")) return;
    setStatus("loading");
    try {
      const loginRes = await fetch("/api/profiles/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!loginRes.ok) {
        setStatus("error");
        return;
      }
      const { id } = await loginRes.json();
      const patchRes = await fetch(`/api/profiles/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ digest_cadence: "weekly" }),
      });
      if (patchRes.ok) setStatus("done");
      else setStatus("error");
    } catch {
      setStatus("error");
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--space-8)" }}>
      <div style={{ maxWidth: 440, width: "100%", textAlign: "center" }}>
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "var(--text-2xl)", fontWeight: "var(--weight-bold)", letterSpacing: "var(--tracking-tight)", color: "var(--color-fg)", marginBottom: "var(--space-4)" }}>
          Unsubscribe
        </h1>

        {status === "done" ? (
          <div>
            <p style={{ fontSize: "var(--text-base)", color: "var(--color-fg-secondary)", marginBottom: "var(--space-6)" }}>
              Your digest has been switched to weekly. You&apos;ll receive one digest per week instead of daily.
            </p>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-muted)", marginBottom: "var(--space-6)" }}>
              To fully stop receiving emails, visit{" "}
              <Link href="/digest" style={{ color: "var(--color-primary)" }}>Digest & preferences</Link>{" "}
              and pause your digest.
            </p>
            <Link href="/" className="btn btn-secondary btn-md">Back to Mahogany</Link>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: "var(--text-base)", color: "var(--color-fg-muted)", marginBottom: "var(--space-6)" }}>
              We&apos;ll switch your digest to weekly delivery. Enter your email to confirm.
            </p>
            <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-4)" }}>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                style={{ flex: 1 }}
              />
              <button
                onClick={handleUnsubscribe}
                disabled={status === "loading" || !email.includes("@")}
                className="btn btn-primary btn-md"
              >
                {status === "loading" ? "..." : "Confirm"}
              </button>
            </div>
            {status === "error" && (
              <p style={{ fontSize: "var(--text-sm)", color: "var(--color-danger)" }}>
                Could not find an account with that email.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
