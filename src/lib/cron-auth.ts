/**
 * Validates cron request auth. When CRON_SECRET is set, requires Authorization: Bearer <secret>.
 * When not set (local dev), allows all requests.
 */
export function requireCronAuth(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}
