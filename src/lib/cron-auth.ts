/**
 * Validates cron request auth. When CRON_SECRET is set, requires Authorization: Bearer <secret>.
 * When not set (local dev), allows all requests.
 *
 * Temporary escape hatch: set CRON_AUTH_DISABLED=true to bypass auth (e.g. when Railway
 * reference vars don't resolve). Remove once CRON_SECRET is fixed on the cron service.
 */
export function requireCronAuth(request: Request): boolean {
  if (process.env.CRON_AUTH_DISABLED === "true" || process.env.CRON_AUTH_DISABLED === "1") {
    if (process.env.NODE_ENV === "production") {
      console.warn("[cron-auth] CRON_AUTH_DISABLED is set — cron endpoints are unprotected");
    }
    return true;
  }
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}
