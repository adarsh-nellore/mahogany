import Anthropic from "@anthropic-ai/sdk";

export type AgentProvider = "anthropic";

export function getAgentProvider(): AgentProvider {
  return "anthropic";
}

export function getAnthropicClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

