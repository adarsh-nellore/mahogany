import { Profile, Signal } from "./types";
import { runDigestAgent } from "./digestAgent";

/**
 * Generates a personalized digest using the agentic pipeline.
 *
 * The agent:
 * 1. Reviews all signals and the user's profile
 * 2. Fetches actual source pages for the most important signals
 * 3. Checks previous digests for story continuity
 * 4. Searches for related signals to find patterns
 * 5. Produces the final digest markdown
 */
export async function generateDigest(
  profile: Profile,
  signals: Signal[]
): Promise<string> {
  if (signals.length === 0) {
    const dl = profile.domains
      .map((d) => (d === "pharma" ? "Biopharma" : "Medical Device"))
      .join(" & ");
    const dateStr = new Date().toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    return `${profile.regions.join("/")} ${dl} Regulatory Intelligence Digest – ${dateStr}\n\nThere’s nothing in your briefing yet. Open your feed and use “Generate Briefing” to build your first digest; we’ll use that same content here next time.\n`;
  }

  return runDigestAgent(profile, signals);
}
