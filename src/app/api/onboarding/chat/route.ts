import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { searchProducts, ProductSearchResult } from "@/lib/productSearch";

function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: "search_products",
    description:
      "Search for pharmaceutical drugs, biologics, and medical devices across FDA databases. Use when the user mentions a specific product, drug, or device by name and you want to find the official regulatory record.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Product name to search for" },
        domain: {
          type: "string",
          enum: ["pharma", "devices", "both"],
          description: "Domain to search. Use 'pharma' for drugs/biologics, 'devices' for medical devices, 'both' if unsure.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "update_profile",
    description: `Update the extracted profile data. Call this whenever you learn new information about the user from the conversation. You can call this multiple times — each call merges with previous data. Fields:
- role: their job title/function
- regions: array of markets they follow (US, EU, UK, Canada, Australia, Japan, Switzerland, Global)
- domains: array of 'devices' and/or 'pharma'
- therapeutic_areas: array (oncology, cardiology, neurology, orthopedics, endocrinology, immunology, dermatology, ophthalmology, gastroenterology, pulmonology, hematology, nephrology, infectious disease, rare disease, wound care, dental, SaMD, respiratory, psychiatry, pediatrics, radiology)
- own_products: array of {name, generic_name?, company?, product_type, domain, region?, regulatory_id?, source} for user's own products
- competitor_products: same shape for competitor products
- competitors: array of competitor company names
- regulatory_frameworks: array of frameworks (510(k), PMA, De Novo, NDA, BLA, MDR, IVDR, etc.)
- organization: their company name
- notes: any other relevant context about what they need`,
    input_schema: {
      type: "object" as const,
      properties: {
        role: { type: "string" },
        regions: { type: "array", items: { type: "string" } },
        domains: { type: "array", items: { type: "string" } },
        therapeutic_areas: { type: "array", items: { type: "string" } },
        own_products: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              generic_name: { type: "string" },
              company: { type: "string" },
              product_type: { type: "string" },
              domain: { type: "string" },
              region: { type: "string" },
              regulatory_id: { type: "string" },
              source: { type: "string" },
            },
            required: ["name", "product_type", "domain"],
          },
        },
        competitor_products: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              generic_name: { type: "string" },
              company: { type: "string" },
              product_type: { type: "string" },
              domain: { type: "string" },
              region: { type: "string" },
              regulatory_id: { type: "string" },
              source: { type: "string" },
            },
            required: ["name", "product_type", "domain"],
          },
        },
        competitors: { type: "array", items: { type: "string" } },
        regulatory_frameworks: { type: "array", items: { type: "string" } },
        organization: { type: "string" },
        notes: { type: "string" },
      },
    },
  },
];

const SYSTEM_PROMPT = `You are the onboarding assistant for Mahogany, a regulatory intelligence platform for pharma and medical device professionals. Your job is to have a natural conversation to understand what this user needs so we can personalize their feed and alerts.

CONVERSATION GOALS (gather all of these, but naturally — don't interrogate):
1. What they do (role, company)
2. What markets/regions they care about
3. Whether they're in pharma, devices, or both
4. Their therapeutic areas of interest
5. Their specific products (own products they're responsible for)
6. Competitor products they want to track
7. Any regulatory frameworks or submissions they're focused on

BEHAVIOR:
- Be warm, professional, and concise. This is a setup conversation, not a support chat.
- Ask open-ended questions. Let the user describe their work naturally — don't present lists of options.
- When the user mentions a product by name, use search_products to find the official regulatory record and confirm with the user. Show them what you found briefly (name, company, regulatory ID) and ask if that's the right one.
- Call update_profile every time you learn something new. Don't wait until the end.
- Infer domains and therapeutic areas from context. If someone says "we make cardiac stents" — that's devices + cardiology. If they mention "our PD-1 inhibitor" — that's pharma + oncology + immunology.
- After 2-3 exchanges, if you have a reasonable picture, offer a summary: "Here's what I've gathered so far: ..." and ask if anything is missing or if they want to add competitor products.
- When you think you have enough info (role, at least 1 region, at least 1 domain, and at least 1 product or therapeutic area), add a special marker at the very end of your message on its own line: ---PROFILE_READY---
- Don't add ---PROFILE_READY--- too early. Make sure you've asked about competitors and given the user a chance to add more context.
- Keep responses short — 2-3 sentences plus a question. Don't lecture.

FIRST MESSAGE:
Start with a brief, friendly welcome and ask what they do / what products they work on. One question to get started.`;

export async function POST(request: NextRequest) {
  try {
    const { messages: chatMessages, profile_data: existingProfileData } =
      (await request.json()) as {
        messages: ChatMessage[];
        profile_data?: Record<string, unknown>;
      };

    if (!chatMessages || chatMessages.length === 0) {
      return NextResponse.json(
        { error: "Messages required" },
        { status: 400 }
      );
    }

    const client = getAnthropic();
    let profileUpdates: Record<string, unknown> = {};

    // Run agent loop (max 3 tool-use turns per request)
    const messages: Anthropic.MessageParam[] = chatMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    let reply = "";

    for (let turn = 0; turn < 4; turn++) {
      const response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages,
      });

      const textParts: string[] = [];
      const toolUses: Anthropic.ToolUseBlock[] = [];

      for (const block of response.content) {
        if (block.type === "text") textParts.push(block.text);
        if (block.type === "tool_use") toolUses.push(block);
      }

      if (toolUses.length === 0) {
        reply = textParts.join("\n");
        break;
      }

      // Process tool calls
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUses) {
        const input = toolUse.input as Record<string, unknown>;

        if (toolUse.name === "search_products") {
          const q = input.query as string;
          const domain = (input.domain as string) || "both";
          let results: ProductSearchResult[] = [];
          try {
            results = await searchProducts(
              q,
              domain as "pharma" | "devices" | "both"
            );
          } catch {
            results = [];
          }

          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content:
              results.length > 0
                ? JSON.stringify(results.slice(0, 5))
                : `No results found for "${q}". The user may be referring to a product not yet in FDA databases, or using an informal name. Ask them to clarify or just note it as-is.`,
          });
        } else if (toolUse.name === "update_profile") {
          // Merge updates
          for (const [key, value] of Object.entries(input)) {
            if (Array.isArray(value) && Array.isArray(profileUpdates[key])) {
              // Merge arrays, deduplicate
              const existing = profileUpdates[key] as unknown[];
              const merged = [...existing];
              for (const item of value) {
                if (typeof item === "string") {
                  if (!merged.includes(item)) merged.push(item);
                } else if (
                  typeof item === "object" &&
                  item !== null &&
                  "name" in item
                ) {
                  if (
                    !merged.some(
                      (m) =>
                        typeof m === "object" &&
                        m !== null &&
                        "name" in m &&
                        (m as { name: string }).name ===
                          (item as { name: string }).name
                    )
                  )
                    merged.push(item);
                } else {
                  merged.push(item);
                }
              }
              profileUpdates[key] = merged;
            } else if (value !== undefined && value !== null && value !== "") {
              profileUpdates[key] = value;
            }
          }

          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: "Profile updated.",
          });
        }
      }

      // If there was text + tools, capture the text
      if (textParts.length > 0 && turn === 0) {
        reply = textParts.join("\n");
      }

      // Continue the loop with tool results
      messages.push({ role: "assistant", content: response.content });
      messages.push({
        role: "user",
        content: toolResults,
      });

      // If no more tool calls expected, get final text
      if (
        response.stop_reason === "end_turn" ||
        response.stop_reason === "stop_sequence"
      ) {
        reply = textParts.join("\n");
        break;
      }
    }

    // Check if profile is ready
    const profileReady = reply.includes("---PROFILE_READY---");
    if (profileReady) {
      reply = reply.replace(/\n?---PROFILE_READY---\n?/g, "").trim();
    }

    return NextResponse.json({
      reply,
      profile_data: profileUpdates,
      profile_ready: profileReady,
    });
  } catch (err) {
    console.error("[api/onboarding/chat]", err);
    return NextResponse.json(
      { error: "Onboarding chat failed", details: String(err) },
      { status: 500 }
    );
  }
}
