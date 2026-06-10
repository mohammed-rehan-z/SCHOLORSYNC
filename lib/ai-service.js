import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { SystemMessage, HumanMessage, AIMessage } from "@langchain/core/messages";

/**
 * Model name defaults per provider
 */
const DEFAULT_MODELS = {
  gemini: "gemini-2.0-flash",
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-20241022",
  mistral: "mistral-small-latest",
  groq: "llama-3.1-8b-instant",
};

// ─── Context size caps (keeps token usage low) ────────────────────────────────
const MAX_ANALYZE_CHARS = 22_000; // combined analysis prompt (~5,500 tokens)
const MAX_CHAT_HISTORY  = 8;      // max past messages sent to model per query
const MAX_CHAT_CHUNKS   = 5;      // retrieved RAG chunks per query

/**
 * Safely extract string content from a LangChain message response.
 * Handles both string and Gemini array-of-parts formats.
 */
function extractText(response) {
  const content = response?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "string" ? part : part?.text ?? ""))
      .join("");
  }
  throw new Error("Unexpected response format from model.");
}

/**
 * Strip markdown code fences and parse JSON robustly.
 */
function parseJSON(raw) {
  let cleaned = raw
    .replace(/^```(?:json)?\s*/im, "")
    .replace(/```\s*$/im, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end   = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1) cleaned = cleaned.slice(start, end + 1);
  return JSON.parse(cleaned);
}

/**
 * Build a condensed context string from chunks, hard-capped at maxChars.
 */
function buildContext(chunks, maxChars) {
  const sorted = [...chunks].sort((a, b) => a.page - b.page);
  let ctx = "";
  for (const chunk of sorted) {
    const line = `[Page ${chunk.page}]\n${chunk.content}\n\n`;
    if (ctx.length + line.length > maxChars) break;
    ctx += line;
  }
  return ctx;
}

/**
 * Factory: build the right LangChain chat model for the given provider.
 */
function buildChatModel(apiKey, provider = "gemini", modelOverride = null, temperature = 0.2, geminiJsonMode = false) {
  const modelName = modelOverride || DEFAULT_MODELS[provider] || DEFAULT_MODELS.gemini;

  switch (provider) {
    case "openai":
      return new ChatOpenAI({ openAIApiKey: apiKey, model: modelName, temperature });

    case "anthropic":
      return new ChatAnthropic({ anthropicApiKey: apiKey, model: modelName, temperature });

    case "mistral":
      return new ChatOpenAI({
        openAIApiKey: apiKey,
        model: modelName,
        temperature,
        configuration: { baseURL: "https://api.mistral.ai/v1" },
      });

    case "groq":
      return new ChatOpenAI({
        openAIApiKey: apiKey,
        model: modelName,
        temperature,
        configuration: { baseURL: "https://api.groq.com/openai/v1" },
      });

    case "gemini":
    default:
      return new ChatGoogleGenerativeAI({
        apiKey,
        model: modelName,
        temperature,
        ...(geminiJsonMode
          ? { generationConfig: { responseMimeType: "application/json" } }
          : {}),
      });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// analyzePaper  ← ONE call instead of two (saves 50% API quota on upload)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Combined analysis: returns { summary, metadata } in a single API call.
 * This replaces calling generateSummary + extractTabularMetadata separately.
 *
 * @param {string} apiKey
 * @param {string} model
 * @param {Array<{content: string, page: number}>} chunks
 * @param {string} [provider="gemini"]
 * @returns {Promise<{ summary: string, metadata: object }>}
 */
export async function analyzePaper(apiKey, model, chunks, provider = "gemini") {
  if (!apiKey)  throw new Error("API Key is required");
  if (!chunks?.length) throw new Error("No text chunks provided");

  const context = buildContext(chunks, MAX_ANALYZE_CHARS);

  const prompt = `You are an expert academic research analyst. Analyse the research paper text below and respond with a single valid JSON object — no markdown fences, no extra text.

JSON schema (all fields required):
{
  "metadata": {
    "title": "Full paper title",
    "authors": "Author names (e.g. Zhang et al.)",
    "year": "4-digit year",
    "problem": "Primary research problem (1-3 sentences)",
    "methodology": "Technical approach / experimental design (1-3 sentences)",
    "keyFindings": "Main quantitative results (1-3 sentences)",
    "contributions": "Core contribution to the field (1-2 sentences)",
    "dataset": "Datasets used, or 'Not specified'",
    "tags": ["tag1","tag2","tag3"],
    "citation": {
      "apa": "APA citation string",
      "mla": "MLA citation string",
      "bibtex": "@article{key,\\n  title={...},\\n  author={...},\\n  year={...}\\n}"
    }
  },
  "summary": "# Executive Summary\\n\\n## 1. Abstract & Introduction\\n...\\n\\n## 2. Core Methodology\\n...\\n\\n## 3. Key Findings & Results\\n...\\n\\n## 4. Limitations\\n...\\n\\n## 5. Future Directions\\n..."
}

The summary value must be a single Markdown string with these five sections.

PAPER TEXT:
${context}`;

  // Use JSON mode for Gemini to guarantee parseable output
  const chatModel = buildChatModel(apiKey, provider, model, 0.2, provider === "gemini");
  const response  = await chatModel.invoke([new HumanMessage(prompt)]);
  const raw       = extractText(response);

  let parsed;
  try {
    parsed = parseJSON(raw);
  } catch (e) {
    console.error("analyzePaper JSON parse error. Raw (first 400 chars):", raw.slice(0, 400));
    throw new Error("Model returned malformed JSON. Try again or switch to a different model.");
  }

  if (!parsed.summary || !parsed.metadata) {
    throw new Error("Incomplete response structure from model.");
  }

  return { summary: parsed.summary, metadata: parsed.metadata };
}

// ─────────────────────────────────────────────────────────────────────────────
// generateSummary  (kept for manual "Generate Analysis" button on existing papers)
// ─────────────────────────────────────────────────────────────────────────────
export async function generateSummary(apiKey, model, chunks, provider = "gemini") {
  if (!apiKey) throw new Error("API Key is required for summarization");

  const context = buildContext(chunks, MAX_ANALYZE_CHARS);

  const prompt = `You are an expert academic research assistant. Read the research paper text and produce a comprehensive executive summary in Markdown.

Use EXACTLY these section headers:

# Executive Summary

## 1. Abstract & Introduction
## 2. Core Methodology
## 3. Key Findings & Results
## 4. Limitations
## 5. Future Directions

---
PAPER TEXT:
${context}`;

  const chatModel = buildChatModel(apiKey, provider, model, 0.2);
  const response  = await chatModel.invoke([new HumanMessage(prompt)]);
  const text      = extractText(response);
  if (!text) throw new Error("Empty response from model");
  return text;
}

// ─────────────────────────────────────────────────────────────────────────────
// extractTabularMetadata  (kept for "Generate Analysis" button on existing papers)
// ─────────────────────────────────────────────────────────────────────────────
export async function extractTabularMetadata(apiKey, model, chunks, provider = "gemini") {
  if (!apiKey) throw new Error("API Key is required for metadata extraction");

  const sorted  = [...chunks].sort((a, b) => a.page - b.page);
  const early   = sorted.slice(0, 4);
  const late    = sorted.slice(-2);
  const picked  = [...early, ...late.filter(c => !early.includes(c))];
  let   ctx     = "";
  for (const chunk of picked) {
    const line = `[Page ${chunk.page}]\n${chunk.content}\n\n`;
    if (ctx.length + line.length > 6_000) break;
    ctx += line;
  }

  const prompt = `Extract metadata from the research paper snippets and return ONLY valid JSON — no fences, no extra text.

Schema:
{
  "title": "...", "authors": "...", "year": "...",
  "problem": "...", "methodology": "...", "keyFindings": "...",
  "contributions": "...", "dataset": "...",
  "tags": ["..."],
  "citation": { "apa": "...", "mla": "...", "bibtex": "..." }
}

SNIPPETS:
${ctx}`;

  const chatModel = buildChatModel(apiKey, provider, model, 0.1, provider === "gemini");
  const response  = await chatModel.invoke([new HumanMessage(prompt)]);
  const raw       = extractText(response);

  try {
    return parseJSON(raw);
  } catch {
    throw new Error("Model returned malformed JSON for metadata.");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// performRagChat
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Answer a user query using retrieved RAG chunks + trimmed history.
 * History is capped at MAX_CHAT_HISTORY messages to keep token usage minimal.
 */
export async function performRagChat(apiKey, model, query, contextChunks, history = [], provider = "gemini") {
  if (!apiKey) throw new Error("API Key is required for chat");

  // Cap retrieved context
  const cappedChunks = contextChunks.slice(0, MAX_CHAT_CHUNKS);
  const contextText  = cappedChunks
    .map((c, i) => `--- SOURCE ${i + 1} (Page ${c.page}) ---\n${c.content}`)
    .join("\n\n");

  const systemInstruction = `You are a precise academic research assistant. Answer using ONLY the sources below.
Rules: cite page numbers as [Page X]; use Markdown; use LaTeX for equations; don't speculate beyond the sources.

SOURCES:
${contextText}`;

  const messages = [new SystemMessage(systemInstruction)];

  // Only send the last MAX_CHAT_HISTORY messages to the model
  const trimmedHistory = history.slice(-MAX_CHAT_HISTORY);
  for (const msg of trimmedHistory) {
    messages.push(
      (msg.role === "ai" || msg.role === "model")
        ? new AIMessage(msg.content)
        : new HumanMessage(msg.content)
    );
  }

  messages.push(new HumanMessage(query));

  const chatModel = buildChatModel(apiKey, provider, model, 0.1);
  const response  = await chatModel.invoke(messages);
  const text      = extractText(response);
  if (!text) throw new Error("Empty response from model");
  return text;
}
