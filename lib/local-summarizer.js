/**
 * Local Extractive Summarizer — v2
 * 
 * Generates structured summaries and metadata from research paper text
 * using heuristic section detection. Zero API calls — fully local.
 *
 * Improvements over v1:
 * - Multi-chunk section extraction (spans across chunk boundaries)
 * - Dataset/benchmark detection with named-entity extraction
 * - More robust section header matching (numbered/unnumbered, all caps)
 * - Wider sentence windows for richer summaries
 * - Keywords line extraction from papers that have a "Keywords:" line
 */

// ─── Section header patterns (ordered by priority) ──────────────────────────
const SECTION_HEADERS = {
  abstract: [
    /^\s*abstract\s*$/im,
    /\babstract[:\s—–-]/i,
    /\babstract\b/i,
  ],
  introduction: [
    /^\s*(?:\d+\.?\s+)?introduction\s*$/im,
    /\bintroduction[:\s—–-]/i,
    /\bintroduction\b/i,
  ],
  relatedWork: [
    /^\s*(?:\d+\.?\s+)?(?:related\s+work|literature\s+review|background)\s*$/im,
    /\brelated\s+work\b/i,
    /\bliterature\s+review\b/i,
    /\bbackground\b/i,
  ],
  methodology: [
    /^\s*(?:\d+\.?\s+)?(?:method(?:ology|s)?|proposed\s+(?:method|approach|system|framework|model)|our\s+approach|technical\s+approach)\s*$/im,
    /\bmethod(?:ology|s)?\b/i,
    /\bproposed\s+(?:method|approach|system|framework|model)\b/i,
    /\bmodel\s+architecture\b/i,
    /\bsystem\s+design\b/i,
    /\bexperimental\s+setup\b/i,
    /\bimplementation\b/i,
  ],
  experiments: [
    /^\s*(?:\d+\.?\s+)?(?:experiments?|experimental\s+results?|evaluation|results?\s+and\s+discussion)\s*$/im,
    /\bexperiments?\b/i,
    /\bevaluation\b/i,
    /\bexperimental\s+results?\b/i,
  ],
  results: [
    /^\s*(?:\d+\.?\s+)?(?:results?|findings|performance|analysis)\s*$/im,
    /\bresults?\b/i,
    /\bfindings\b/i,
    /\bperformance\b/i,
  ],
  discussion: [
    /^\s*(?:\d+\.?\s+)?(?:discussion|limitations?|threats?\s+to\s+validity)\s*$/im,
    /\bdiscussion\b/i,
    /\blimitations?\b/i,
  ],
  conclusion: [
    /^\s*(?:\d+\.?\s+)?(?:conclusions?|concluding\s+remarks|summary\s+and\s+(?:future|conclusions?))\s*$/im,
    /\bconclusions?\b/i,
    /\bconcluding\s+remarks\b/i,
  ],
  futureWork: [
    /^\s*(?:\d+\.?\s+)?(?:future\s+(?:work|directions?|research)|open\s+problems?)\s*$/im,
    /\bfuture\s+(?:work|directions?|research)\b/i,
  ],
};

// ─── Well-known dataset / benchmark names ───────────────────────────────────
const KNOWN_DATASETS = [
  // NLP
  "GLUE", "SuperGLUE", "SQuAD", "SQuAD 2.0", "CoNLL", "IMDB", "SST", "SST-2", "SST-5",
  "MNLI", "SNLI", "QQP", "MRPC", "RTE", "WNLI", "CoLA", "QNLI", "AG News",
  "Yelp", "Amazon Reviews", "WikiText", "WikiText-103", "Penn Treebank", "PTB",
  "WMT", "BLEU", "ROUGE", "BoolQ", "MultiRC", "CommonSenseQA", "HellaSwag",
  "ARC", "PIQA", "WinoGrande", "TriviaQA", "Natural Questions", "HotpotQA",
  "OpenBookQA", "RACE", "C4", "The Pile", "RedPajama", "MMLU",
  // Vision
  "ImageNet", "CIFAR-10", "CIFAR-100", "MNIST", "Fashion-MNIST", "SVHN",
  "COCO", "MS COCO", "Pascal VOC", "VOC2007", "VOC2012", "LSUN",
  "CelebA", "LFW", "ADE20K", "Cityscapes", "KITTI", "SUN397",
  "Places365", "iNaturalist", "Oxford Pets", "Flowers-102", "Stanford Cars",
  "Food-101", "STL-10", "Caltech-101", "Caltech-256",
  // Audio/Speech
  "LibriSpeech", "Common Voice", "VoxCeleb", "AudioSet", "TIMIT",
  // Medical
  "MIMIC", "MIMIC-III", "MIMIC-IV", "ChestX-ray", "CheXpert", "ISIC",
  "COVID-CT", "BraTS", "LUNA16",
  // Tabular/Other
  "UCI", "Kaggle", "MovieLens", "Netflix Prize", "Criteo",
  "Enwik8", "BookCorpus", "OpenWebText", "CC-News",
  // Graphs
  "Cora", "Citeseer", "PubMed", "OGB", "Reddit",
  // RL
  "Atari", "MuJoCo", "OpenAI Gym", "DMControl",
];

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Split text into clean sentences, filtering noise.
 */
function splitSentences(text) {
  return text
    .replace(/\n+/g, " ")
    .replace(/\s{2,}/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => {
      if (s.length < 25 || s.length > 800) return false;
      // Skip reference-like lines
      if (/^\[\d+\]/.test(s)) return false;
      // Skip lines that are mostly numbers/symbols
      if (s.replace(/[^a-zA-Z]/g, "").length < s.length * 0.4) return false;
      return true;
    });
}

/**
 * Extract a section by scanning ALL chunks for a header match.
 * Collects text from the matched chunk + following chunks until the next section header.
 * Returns up to maxChars of clean text.
 */
function extractSectionText(chunks, headerPatterns, maxChars = 3000) {
  // Try each pattern from most specific to least
  for (const pattern of headerPatterns) {
    for (let i = 0; i < chunks.length; i++) {
      const match = chunks[i].content.match(pattern);
      if (!match) continue;

      // Collect text from match point forward
      const matchIdx = chunks[i].content.indexOf(match[0]);
      let text = chunks[i].content.slice(matchIdx + match[0].length).trim();

      // Continue collecting from subsequent chunks until we hit another section header
      const allHeaders = Object.values(SECTION_HEADERS).flat();
      for (let j = i + 1; j < chunks.length && text.length < maxChars; j++) {
        // Stop if next chunk starts with a section header
        const nextContent = chunks[j].content.trim();
        const hitsHeader = allHeaders.some(h => {
          const m = nextContent.match(h);
          return m && nextContent.indexOf(m[0]) < 80; // header in first 80 chars
        });
        if (hitsHeader && text.length > 200) break; // enough collected
        text += "\n" + nextContent;
      }

      return text.slice(0, maxChars);
    }
  }
  return "";
}

/**
 * Detect datasets and benchmarks mentioned in the paper.
 * Uses both a known-names dictionary and pattern-based extraction.
 */
function detectDatasets(chunks) {
  const allText = chunks.map(c => c.content).join(" ");
  const found = new Set();

  // 1. Check for known dataset names (case-sensitive for acronyms)
  for (const ds of KNOWN_DATASETS) {
    // For short acronyms (≤5 chars), require word boundary match
    if (ds.length <= 5) {
      const re = new RegExp(`\\b${ds.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
      if (re.test(allText)) found.add(ds);
    } else {
      if (allText.includes(ds)) found.add(ds);
    }
  }

  // 2. Pattern-based extraction: "dataset" / "benchmark" / "corpus" mentions
  const datasetPatterns = [
    /(?:the\s+)?(\b[A-Z][A-Za-z0-9-]+(?:\s+[A-Z][A-Za-z0-9-]+){0,3})\s+(?:dataset|benchmark|corpus|collection)/gi,
    /(?:dataset|benchmark|corpus|collection)\s+(?:called|named|known\s+as)\s+(\b[A-Z][A-Za-z0-9-]+(?:\s+[A-Za-z0-9-]+){0,2})/gi,
    /trained\s+on\s+(?:the\s+)?(\b[A-Z][A-Za-z0-9-]+(?:\s+[A-Za-z0-9-]+){0,2})/gi,
    /evaluated\s+on\s+(?:the\s+)?(\b[A-Z][A-Za-z0-9-]+(?:\s+[A-Za-z0-9-]+){0,2})/gi,
    /tested\s+on\s+(?:the\s+)?(\b[A-Z][A-Za-z0-9-]+(?:\s+[A-Za-z0-9-]+){0,2})/gi,
  ];

  for (const pat of datasetPatterns) {
    let m;
    while ((m = pat.exec(allText)) !== null) {
      const name = m[1]?.trim();
      if (name && name.length > 2 && name.length < 50) {
        // Skip generic terms
        if (!/^(The|Our|This|We|A|An|In|On|For|Each|All|Both|Some|These|Their)$/i.test(name)) {
          found.add(name);
        }
      }
    }
  }

  return [...found].slice(0, 12); // cap at 12
}

/**
 * Extract keywords from the "Keywords:" line if present.
 */
function extractKeywords(chunks) {
  for (const chunk of chunks.slice(0, 5)) {
    const kwMatch = chunk.content.match(/keywords?\s*[:—–-]\s*(.+?)(?:\n|$)/i);
    if (kwMatch) {
      return kwMatch[1]
        .split(/[,;]/)
        .map(k => k.trim())
        .filter(k => k.length > 1 && k.length < 50)
        .slice(0, 8);
    }
  }
  return [];
}

// ─── Main Functions ─────────────────────────────────────────────────────────

/**
 * Generate a local extractive summary from paper chunks.
 *
 * @param {Array<{content: string, page: number}>} chunks
 * @param {string} title
 * @param {string} authors
 * @returns {string} Markdown summary
 */
export function generateLocalSummary(chunks, title = "Unknown", authors = "Unknown") {
  if (!chunks || chunks.length === 0) return null;

  const sorted = [...chunks].sort((a, b) => a.page - b.page);

  // Extract each section with multi-chunk spanning
  const abstractText   = extractSectionText(sorted, SECTION_HEADERS.abstract, 2500);
  const introText      = extractSectionText(sorted, SECTION_HEADERS.introduction, 2500);
  const methodText     = extractSectionText(sorted, SECTION_HEADERS.methodology, 3000);
  const expText        = extractSectionText(sorted, SECTION_HEADERS.experiments, 2500);
  const resultsText    = extractSectionText(sorted, SECTION_HEADERS.results, 2500);
  const discussionText = extractSectionText(sorted, SECTION_HEADERS.discussion, 2000);
  const conclusionText = extractSectionText(sorted, SECTION_HEADERS.conclusion, 2000);
  const futureText     = extractSectionText(sorted, SECTION_HEADERS.futureWork, 1500);

  // Detect datasets
  const datasets = detectDatasets(sorted);
  const keywords = extractKeywords(sorted);

  // Build summary
  const sections = [];
  sections.push(`# Extractive Summary: ${title}\n`);

  // 1. Abstract & Introduction
  sections.push("## 1. Abstract & Introduction");
  const abstractSrc = abstractText || introText || sorted[0]?.content || "";
  const abstractSents = splitSentences(abstractSrc);
  if (abstractSents.length > 0) {
    sections.push(abstractSents.slice(0, 8).join(" "));
    // If we also have intro and abstract was found separately, add intro highlights
    if (abstractText && introText) {
      const introSents = splitSentences(introText);
      if (introSents.length > 0) {
        sections.push("\n**Key context from introduction:**");
        sections.push(introSents.slice(0, 4).join(" "));
      }
    }
  } else {
    sections.push(splitSentences(sorted[0]?.content || "").slice(0, 5).join(" ") || "_No abstract detected._");
  }

  // 2. Core Methodology
  sections.push("\n## 2. Core Methodology");
  const methodSents = splitSentences(methodText);
  if (methodSents.length > 0) {
    sections.push(methodSents.slice(0, 8).join(" "));
  } else {
    sections.push("_Methodology section not detected. Use Q&A Chat to ask about the paper's methods._");
  }

  // 3. Key Findings & Results
  sections.push("\n## 3. Key Findings & Results");
  const combinedResults = (expText + " " + resultsText).trim();
  const resultSents = splitSentences(combinedResults);
  if (resultSents.length > 0) {
    sections.push(resultSents.slice(0, 8).join(" "));
  } else {
    sections.push("_Results section not detected. Use Q&A Chat to query specific findings._");
  }

  // 4. Limitations & Discussion
  sections.push("\n## 4. Limitations & Discussion");
  const discSents = splitSentences(discussionText);
  if (discSents.length > 0) {
    sections.push(discSents.slice(0, 5).join(" "));
  } else {
    sections.push("_Discussion/limitations section not detected._");
  }

  // 5. Conclusions & Future Directions
  sections.push("\n## 5. Conclusions & Future Directions");
  const concSents = splitSentences(conclusionText);
  const futureSents = splitSentences(futureText);
  if (concSents.length > 0) {
    sections.push(concSents.slice(0, 5).join(" "));
  }
  if (futureSents.length > 0) {
    sections.push("\n**Future work:**");
    sections.push(futureSents.slice(0, 3).join(" "));
  }
  if (concSents.length === 0 && futureSents.length === 0) {
    sections.push("_Conclusion section not detected._");
  }

  // 6. Datasets & Benchmarks
  sections.push("\n## 6. Datasets & Benchmarks");
  if (datasets.length > 0) {
    sections.push("The following datasets/benchmarks were identified in the paper:\n");
    datasets.forEach(ds => sections.push(`- **${ds}**`));
  } else {
    sections.push("_No named datasets or benchmarks detected. The paper may use synthesized or proprietary data._");
  }

  // 7. Paper Statistics
  const totalPages = Math.max(...sorted.map(c => c.page), 1);
  const totalChunks = sorted.length;
  const totalWords = sorted.reduce((acc, c) => acc + c.content.split(/\s+/).length, 0);
  sections.push(`\n## 7. Document Statistics`);
  sections.push(`| Metric | Value |`);
  sections.push(`|---|---|`);
  sections.push(`| **Pages** | ${totalPages} |`);
  sections.push(`| **Text Chunks** | ${totalChunks} |`);
  sections.push(`| **Word Count** | ~${totalWords.toLocaleString()} |`);
  sections.push(`| **Authors** | ${authors} |`);
  if (keywords.length > 0) {
    sections.push(`| **Keywords** | ${keywords.join(", ")} |`);
  }
  if (datasets.length > 0) {
    sections.push(`| **Datasets** | ${datasets.join(", ")} |`);
  }

  sections.push(`\n> **Note:** This is a locally extracted summary — sections are identified by header patterns in the PDF. Use the Q&A Chat for deeper, targeted analysis.`);

  return sections.join("\n");
}

/**
 * Extract structured metadata from chunks using heuristics (no API).
 *
 * @param {Array<{content: string, page: number}>} chunks
 * @param {string} detectedTitle
 * @returns {object} Metadata object
 */
export function extractLocalMetadata(chunks, detectedTitle = "Unknown") {
  if (!chunks || chunks.length === 0) return {};

  const sorted = [...chunks].sort((a, b) => a.page - b.page);
  const firstPageText = sorted.filter(c => c.page === 1).map(c => c.content).join(" ");

  // Year
  const yearMatch = firstPageText.match(/(?:19|20)\d{2}/);
  const year = yearMatch ? yearMatch[0] : new Date().getFullYear().toString();

  // Problem from abstract
  const abstractText = extractSectionText(sorted, SECTION_HEADERS.abstract, 1500);
  const problem = abstractText
    ? splitSentences(abstractText).slice(0, 3).join(" ")
    : "See paper abstract for details.";

  // Methodology
  const methodText = extractSectionText(sorted, SECTION_HEADERS.methodology, 1500);
  const methodology = methodText
    ? splitSentences(methodText).slice(0, 3).join(" ")
    : "See paper methodology section.";

  // Results
  const expText    = extractSectionText(sorted, SECTION_HEADERS.experiments, 1500);
  const resText    = extractSectionText(sorted, SECTION_HEADERS.results, 1500);
  const combined   = (expText + " " + resText).trim();
  const keyFindings = combined
    ? splitSentences(combined).slice(0, 3).join(" ")
    : "See paper results section.";

  // Contributions from conclusion
  const conclusionText = extractSectionText(sorted, SECTION_HEADERS.conclusion, 1500);
  const contributions = conclusionText
    ? splitSentences(conclusionText).slice(0, 2).join(" ")
    : "See paper conclusion.";

  // Datasets
  const datasets = detectDatasets(sorted);
  const datasetStr = datasets.length > 0 ? datasets.join(", ") : "Not specified";

  // Tags from keywords line + topic detection
  const keywords = extractKeywords(sorted);
  const allText = sorted.slice(0, 8).map(c => c.content).join(" ").toLowerCase();

  const tagCandidates = [
    { term: "deep learning", tag: "Deep Learning" },
    { term: "machine learning", tag: "Machine Learning" },
    { term: "neural network", tag: "Neural Networks" },
    { term: "transformer", tag: "Transformer" },
    { term: "large language model", tag: "LLM" },
    { term: "language model", tag: "Language Models" },
    { term: "nlp", tag: "NLP" },
    { term: "natural language", tag: "NLP" },
    { term: "computer vision", tag: "Computer Vision" },
    { term: "image classification", tag: "Image Classification" },
    { term: "object detection", tag: "Object Detection" },
    { term: "semantic segmentation", tag: "Segmentation" },
    { term: "reinforcement learning", tag: "Reinforcement Learning" },
    { term: "optimization", tag: "Optimization" },
    { term: "classification", tag: "Classification" },
    { term: "generative", tag: "Generative AI" },
    { term: "diffusion", tag: "Diffusion Models" },
    { term: "convolutional", tag: "CNN" },
    { term: "recurrent", tag: "RNN" },
    { term: "attention mechanism", tag: "Attention" },
    { term: "self-attention", tag: "Self-Attention" },
    { term: "graph neural", tag: "GNN" },
    { term: "knowledge graph", tag: "Knowledge Graph" },
    { term: "federated", tag: "Federated Learning" },
    { term: "transfer learning", tag: "Transfer Learning" },
    { term: "fine-tuning", tag: "Fine-Tuning" },
    { term: "zero-shot", tag: "Zero-Shot" },
    { term: "few-shot", tag: "Few-Shot" },
    { term: "contrastive learning", tag: "Contrastive Learning" },
    { term: "self-supervised", tag: "Self-Supervised" },
    { term: "healthcare", tag: "Healthcare" },
    { term: "medical", tag: "Medical AI" },
    { term: "robotics", tag: "Robotics" },
    { term: "autonomous", tag: "Autonomous Systems" },
    { term: "security", tag: "Security" },
    { term: "privacy", tag: "Privacy" },
    { term: "blockchain", tag: "Blockchain" },
    { term: "iot", tag: "IoT" },
    { term: "edge computing", tag: "Edge Computing" },
    { term: "speech recognition", tag: "Speech" },
    { term: "recommendation", tag: "Recommender Systems" },
    { term: "time series", tag: "Time Series" },
    { term: "anomaly detection", tag: "Anomaly Detection" },
  ];

  const detectedTags = [...new Set(
    tagCandidates.filter(t => allText.includes(t.term)).map(t => t.tag)
  )].slice(0, 5);

  // Merge keyword-derived tags
  const kwTags = keywords.map(k => k.charAt(0).toUpperCase() + k.slice(1)).slice(0, 3);
  const allTags = [...new Set([...detectedTags, ...kwTags])].slice(0, 6);

  return {
    year,
    problem,
    methodology,
    keyFindings,
    contributions,
    dataset: datasetStr,
    tags: allTags.length > 0 ? allTags : ["Research", "PDF"],
  };
}

// ─── Chat Answer Synthesis ──────────────────────────────────────────────────

/**
 * Tokenize text into lowercase words for scoring.
 */
function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2);
}

/**
 * Score a sentence against a query by keyword overlap.
 * Returns a float between 0 and 1.
 */
function scoreSentence(sentence, queryTokens) {
  const sentTokens = new Set(tokenize(sentence));
  if (sentTokens.size === 0 || queryTokens.length === 0) return 0;
  
  let matches = 0;
  for (const qt of queryTokens) {
    if (sentTokens.has(qt)) matches++;
  }
  // Weighted: favor coverage of query terms
  return matches / queryTokens.length;
}

/**
 * Synthesize a coherent answer from retrieved chunks for a given question.
 * Uses keyword-overlap scoring to find the most relevant sentences,
 * then assembles them into a structured response with page references.
 *
 * @param {string} question - The user's question
 * @param {Array<{content: string, page: number}>} chunks - Retrieved chunks
 * @param {string} [scopeLabel] - Optional paper title for context
 * @returns {string} Markdown-formatted answer
 */
export function synthesizeAnswer(question, chunks, scopeLabel = "") {
  if (!chunks || chunks.length === 0) {
    return "_No relevant content found. Try rephrasing your question._";
  }

  const queryTokens = tokenize(question);

  // --- Step 1: Extract and score all sentences from all chunks ---
  const scoredSentences = [];
  for (const chunk of chunks) {
    const sentences = splitSentences(chunk.content);
    for (const sent of sentences) {
      const score = scoreSentence(sent, queryTokens);
      scoredSentences.push({ text: sent, score, page: chunk.page });
    }
  }

  // --- Step 2: Sort by relevance score, take top candidates ---
  scoredSentences.sort((a, b) => b.score - a.score);

  // Take sentences with score > 0.15 (at least ~15% query terms match)
  const relevant = scoredSentences.filter(s => s.score > 0.15);

  // If no sentences score well, use the best ones anyway
  const topSentences = relevant.length >= 3
    ? relevant.slice(0, 10)
    : scoredSentences.slice(0, 8);

  if (topSentences.length === 0) {
    return "_The retrieved passages don't contain a clear answer to your question. Try asking in a different way._";
  }

  // --- Step 3: Deduplicate (remove near-duplicates) ---
  const unique = [];
  for (const sent of topSentences) {
    const isDuplicate = unique.some(u => {
      const overlap = tokenize(u.text).filter(t => tokenize(sent.text).includes(t)).length;
      return overlap > Math.min(tokenize(u.text).length, tokenize(sent.text).length) * 0.7;
    });
    if (!isDuplicate) unique.push(sent);
  }

  // --- Step 4: Group by page for structured output ---
  const pageGroups = {};
  for (const sent of unique.slice(0, 8)) {
    const pg = sent.page;
    if (!pageGroups[pg]) pageGroups[pg] = [];
    pageGroups[pg].push(sent.text);
  }

  // --- Step 5: Build the answer ---
  const parts = [];

  // Answer header
  if (scopeLabel) {
    parts.push(`**Based on ${scopeLabel}:**\n`);
  }

  // Main answer body — combine top sentences into a paragraph
  const answerBody = unique
    .slice(0, 6)
    .map(s => s.text)
    .join(" ");

  if (answerBody) {
    parts.push(answerBody);
  }

  // Page references
  const pages = [...new Set(unique.slice(0, 6).map(s => s.page))].sort((a, b) => a - b);
  if (pages.length > 0) {
    parts.push(`\n\n📄 **Source pages:** ${pages.map(p => `Page ${p}`).join(", ")}`);
  }

  // If answer is thin, show supporting excerpts
  if (unique.length > 6) {
    parts.push("\n\n**Additional relevant context:**");
    for (const sent of unique.slice(6, 10)) {
      parts.push(`> ${sent.text} _(Page ${sent.page})_`);
    }
  }

  return parts.join("\n");
}
