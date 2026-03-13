#!/usr/bin/env node
/**
 * Send a test email via Resend.
 * Usage: node scripts/send-test-email.mjs your@email.com
 */
import { Resend } from "resend";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// Load .env.local
const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const key = process.env.RESEND_API_KEY;
if (!key) {
  console.error("RESEND_API_KEY not set in .env.local");
  process.exit(1);
}

const to = process.argv[2] || process.env.USER_EMAIL;
if (!to || !to.includes("@")) {
  console.error("Usage: node scripts/send-test-email.mjs your@email.com");
  process.exit(1);
}

const from = process.env.RESEND_FROM_EMAIL || "Mahogany RI <onboarding@resend.dev>";

const resend = new Resend(key);
const { data, error } = await resend.emails.send({
  from,
  to: [to],
  subject: "Mahogany — Test Email",
  html: `
    <h2>Test email from Mahogany</h2>
    <p>If you received this, Resend is configured correctly.</p>
    <p>Sent at ${new Date().toISOString()}</p>
  `,
});

if (error) {
  console.error("Error:", error.message || error);
  process.exit(1);
}

console.log("Test email sent to", to);
console.log("Id:", data?.id);
