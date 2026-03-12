/**
 * Golden questions test suite for chat quality evaluation.
 *
 * Run manually: npx tsx src/tests/chat-eval.ts
 *
 * Evaluates the chat endpoint against a set of golden questions with
 * expected answer patterns. Scores each response on:
 * - has_citations: Does the response include source links?
 * - answer_specificity: Does it cite specific documents/dates/entities?
 * - correct_entities: Does it mention expected entities?
 */

const CHAT_URL = process.env.CHAT_URL || "http://localhost:3000/api/chat";

interface GoldenQuestion {
  question: string;
  expectedEntities: string[];
  expectedPatterns: RegExp[];
  description: string;
}

interface EvalResult {
  question: string;
  description: string;
  hasCitations: boolean;
  answerSpecificity: number; // 0-1
  correctEntities: number; // 0-1
  suggestions: boolean;
  responseLength: number;
  passed: boolean;
  details: string;
}

const GOLDEN_QUESTIONS: GoldenQuestion[] = [
  {
    question: "What changed for 510(k) recently?",
    expectedEntities: ["510(k)", "FDA", "CDRH"],
    expectedPatterns: [/510\(k\)/i, /clearance|submission|guidance/i],
    description: "Should cite specific 510(k) guidance docs or clearances",
  },
  {
    question: "Are there any safety recalls I should know about?",
    expectedEntities: ["recall", "safety"],
    expectedPatterns: [/recall/i, /class [iI]/i, /FDA|MHRA|EMA/i],
    description: "Should list specific recall events with product names",
  },
  {
    question: "What's happening with EU MDR implementation?",
    expectedEntities: ["MDR", "EU", "EMA"],
    expectedPatterns: [/MDR|medical device regulation/i, /EU|Europe/i],
    description: "Should reference MDR timelines, MDCG guidance, or notified body updates",
  },
  {
    question: "Tell me about recent oncology drug approvals",
    expectedEntities: ["oncology", "approval"],
    expectedPatterns: [/approv/i, /oncology|cancer|tumor/i],
    description: "Should cite specific drug names and approval dates",
  },
  {
    question: "What's new in clinical trials for cardiology devices?",
    expectedEntities: ["clinical trial", "cardiology", "device"],
    expectedPatterns: [/trial|study/i, /cardiac|cardio|heart/i],
    description: "Should reference specific trials or device studies",
  },
  {
    question: "Any EMA guideline updates this week?",
    expectedEntities: ["EMA", "guideline"],
    expectedPatterns: [/EMA|European Medicines Agency/i, /guideline|guidance/i],
    description: "Should list specific EMA guideline documents",
  },
  {
    question: "What enforcement actions has FDA taken recently?",
    expectedEntities: ["FDA", "enforcement"],
    expectedPatterns: [/enforce|warning letter|consent decree|import alert/i],
    description: "Should cite specific enforcement actions with company names",
  },
  {
    question: "How does the MHRA's approach compare to FDA on AI/ML devices?",
    expectedEntities: ["MHRA", "FDA", "AI", "ML"],
    expectedPatterns: [/MHRA/i, /FDA/i, /AI|ML|machine learning|artificial intelligence/i],
    description: "Should compare regulatory approaches across jurisdictions",
  },
  {
    question: "What are the latest updates on drug pricing legislation?",
    expectedEntities: ["pricing", "legislation"],
    expectedPatterns: [/pric|cost/i, /legislat|bill|congress|act/i],
    description: "Should reference specific bills or regulatory pricing actions",
  },
  {
    question: "Summarize today's top 3 most important developments",
    expectedEntities: [],
    expectedPatterns: [/1\.|first|top/i],
    description: "Should provide structured summary with source links",
  },
  {
    question: "What's in my briefing about orthopedic devices?",
    expectedEntities: ["orthopedic", "device"],
    expectedPatterns: [/orthop|joint|implant|spine/i],
    description: "Should filter to orthopedic-relevant content or say none found",
  },
  {
    question: "Are there any new harmonized standards I should be aware of?",
    expectedEntities: ["standard", "harmonized"],
    expectedPatterns: [/standard|ISO|IEC/i],
    description: "Should cite specific standard numbers or updates",
  },
];

async function evaluateQuestion(q: GoldenQuestion): Promise<EvalResult> {
  try {
    const res = await fetch(CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: q.question }],
      }),
    });

    if (!res.ok) {
      return {
        question: q.question,
        description: q.description,
        hasCitations: false,
        answerSpecificity: 0,
        correctEntities: 0,
        suggestions: false,
        responseLength: 0,
        passed: false,
        details: `HTTP ${res.status}: ${await res.text()}`,
      };
    }

    const data = await res.json();
    const reply: string = data.reply || "";
    const suggestions: string[] = data.suggestions || [];

    // Score: has_citations
    const hasMarkdownLinks = /\[[^\]]+\]\([^)]+\)/.test(reply);
    const hasExternalLinks = /\[[^\]]+\]\(https?:\/\/[^)]+\)/.test(reply);
    const hasCitations = hasMarkdownLinks && hasExternalLinks;

    // Score: answer_specificity (0-1)
    const specificityMarkers = [
      /\b\d{4}\b/.test(reply), // Contains a year
      /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(reply) || /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/i.test(reply), // Contains a date
      /\b[A-Z]{2,5}-?\d{2,}\b/.test(reply), // Contains a document number
      /\b(Inc|LLC|Ltd|Corp)\b/i.test(reply) || /\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)+\b/.test(reply), // Named entities
      reply.length > 300, // Substantive length
    ];
    const answerSpecificity = specificityMarkers.filter(Boolean).length / specificityMarkers.length;

    // Score: correct_entities (0-1)
    const entityMatches = q.expectedEntities.filter((e) =>
      reply.toLowerCase().includes(e.toLowerCase())
    );
    const correctEntities = q.expectedEntities.length > 0
      ? entityMatches.length / q.expectedEntities.length
      : 1;

    // Pattern matches
    const patternMatches = q.expectedPatterns.filter((p) => p.test(reply));
    const patternScore = q.expectedPatterns.length > 0
      ? patternMatches.length / q.expectedPatterns.length
      : 1;

    const passed = hasCitations && correctEntities >= 0.5 && patternScore >= 0.5;

    return {
      question: q.question,
      description: q.description,
      hasCitations,
      answerSpecificity,
      correctEntities,
      suggestions: suggestions.length >= 2,
      responseLength: reply.length,
      passed,
      details: [
        `Citations: ${hasCitations ? "YES" : "NO"}`,
        `Specificity: ${(answerSpecificity * 100).toFixed(0)}%`,
        `Entities: ${entityMatches.length}/${q.expectedEntities.length} (${(correctEntities * 100).toFixed(0)}%)`,
        `Patterns: ${patternMatches.length}/${q.expectedPatterns.length} (${(patternScore * 100).toFixed(0)}%)`,
        `Suggestions: ${suggestions.length}`,
        `Length: ${reply.length} chars`,
      ].join(" | "),
    };
  } catch (err) {
    return {
      question: q.question,
      description: q.description,
      hasCitations: false,
      answerSpecificity: 0,
      correctEntities: 0,
      suggestions: false,
      responseLength: 0,
      passed: false,
      details: `Error: ${err}`,
    };
  }
}

async function main() {
  console.log("=== Mahogany Chat Quality Evaluation ===\n");
  console.log(`Endpoint: ${CHAT_URL}`);
  console.log(`Questions: ${GOLDEN_QUESTIONS.length}\n`);

  const results: EvalResult[] = [];

  for (let i = 0; i < GOLDEN_QUESTIONS.length; i++) {
    const q = GOLDEN_QUESTIONS[i];
    console.log(`[${i + 1}/${GOLDEN_QUESTIONS.length}] "${q.question}"`);

    const result = await evaluateQuestion(q);
    results.push(result);

    const status = result.passed ? "PASS" : "FAIL";
    console.log(`  ${status} — ${result.details}\n`);

    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Summary
  console.log("\n=== SUMMARY ===\n");
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  console.log(`Passed: ${passed}/${total} (${((passed / total) * 100).toFixed(0)}%)`);
  console.log(`Avg specificity: ${(results.reduce((sum, r) => sum + r.answerSpecificity, 0) / total * 100).toFixed(0)}%`);
  console.log(`Avg entity match: ${(results.reduce((sum, r) => sum + r.correctEntities, 0) / total * 100).toFixed(0)}%`);
  console.log(`Citations present: ${results.filter((r) => r.hasCitations).length}/${total}`);
  console.log(`Has suggestions: ${results.filter((r) => r.suggestions).length}/${total}`);

  const failedQuestions = results.filter((r) => !r.passed);
  if (failedQuestions.length > 0) {
    console.log(`\nFailed questions:`);
    for (const f of failedQuestions) {
      console.log(`  - "${f.question}" — ${f.details}`);
    }
  }
}

main().catch(console.error);
