/**
 * Dynamic loader and handler for client-side PDF.js extraction
 */

/**
 * Loads PDF.js client-side dynamically and configures the worker
 * @returns {Promise<Object>} The pdfjsLib instance
 */
async function loadPdfJS() {
  if (typeof window === "undefined") {
    throw new Error("PDF parsing can only run in the browser");
  }

  if (window.pdfjsLib) {
    return window.pdfjsLib;
  }

  return new Promise((resolve, reject) => {
    let script = document.getElementById("pdfjs-cdn-script");
    if (script) {
      const checkInterval = setInterval(() => {
        if (window.pdfjsLib) {
          clearInterval(checkInterval);
          resolve(window.pdfjsLib);
        }
      }, 100);
      return;
    }

    script = document.createElement("script");
    script.id = "pdfjs-cdn-script";
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.async = true;
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      resolve(window.pdfjsLib);
    };
    script.onerror = (err) => {
      reject(new Error("Failed to load PDF.js from CDN: " + err.message));
    };
    document.head.appendChild(script);
  });
}

/**
 * Detects the paper title from first-page font-size data.
 * Picks text rendered at the largest font size in the top portion of the page,
 * which is where titles appear in MDPI, IEEE, Google Scholar, ResearchGate, arXiv, etc.
 *
 * @param {Array<{str: string, height: number, y: number}>} fontItems - Items from first page with height
 * @param {string} filenameTitle - Fallback title from filename (stripped extension)
 * @returns {string} Detected title
 */
export function detectTitleFromFontData(fontItems, filenameTitle = "") {
  if (!fontItems || fontItems.length === 0) return filenameTitle;

  // Filter out empty strings and very short fragments
  const valid = fontItems.filter(
    (item) => item.str && item.str.trim().length > 1
  );
  if (valid.length === 0) return filenameTitle;

  // Find the maximum Y position (top of page in PDF coords is highest Y)
  const maxY = Math.max(...valid.map((i) => i.y));
  const minY = Math.min(...valid.map((i) => i.y));
  const pageHeight = maxY - minY;

  // Only consider items in the top 55% of the page — titles are never at bottom
  const topItems = valid.filter((i) => i.y >= minY + pageHeight * 0.45);

  // Skip patterns: affiliations, emails, journal names, page numbers, DOIs, copyright
  const skipPatterns = [
    /^\d+$/, // lone numbers (page numbers)
    /doi:/i,
    /https?:\/\//i,
    /@/,
    /©|copyright/i,
    /received:/i,
    /accepted:/i,
    /published:/i,
    /correspondence:/i,
    /^abstract$/i,
    /^keywords?:/i,
    /^introduction$/i,
    /university|institute|department|school|college|laboratory/i,
    /journal of|proceedings of|conference on|transactions on|letters on/i,
    /vol\.|issue|pp\.|issn|isbn/i,
    /mdpi|elsevier|springer|wiley|ieee|acm|nature|science/i,
  ];

  const filteredTop = topItems.filter(
    (i) => !skipPatterns.some((p) => p.test(i.str.trim()))
  );

  if (filteredTop.length === 0) return filenameTitle;

  // Find the maximum font height among candidates
  const maxHeight = Math.max(...filteredTop.map((i) => i.height));

  if (maxHeight < 6) return filenameTitle; // too small to be a title

  // Collect all items rendered at or near the max font size (within 2pt)
  const titleItems = filteredTop
    .filter((i) => i.height >= maxHeight - 2)
    .sort((a, b) => b.y - a.y || a.x - b.x); // top-to-bottom, left-to-right

  // Group into lines by Y proximity (within 4 units = same line)
  const lines = [];
  for (const item of titleItems) {
    const existingLine = lines.find((l) => Math.abs(l.y - item.y) < 4);
    if (existingLine) {
      existingLine.parts.push(item);
    } else {
      lines.push({ y: item.y, parts: [item] });
    }
  }

  // Sort lines top-to-bottom (descending Y in PDF coords)
  lines.sort((a, b) => b.y - a.y);

  // Build title from first 1-3 lines of large text (multi-line titles are common)
  const titleLines = lines.slice(0, 3).map((line) =>
    line.parts
      .sort((a, b) => a.x - b.x)
      .map((p) => p.str.trim())
      .filter(Boolean)
      .join(" ")
  );

  const title = titleLines.join(" ").replace(/\s+/g, " ").trim();

  // Sanity checks: must be between 10 and 200 chars
  if (title.length < 10 || title.length > 200) return filenameTitle;

  return title;
}

/**
 * Detects author names from first-page font data.
 * 
 * Strategy: Authors appear BELOW the title and ABOVE the abstract/body text.
 * We identify the title region (largest font), then look at the zone between
 * the title bottom and the abstract/introduction header for author-like text.
 *
 * @param {Array<{str: string, height: number, y: number, x: number}>} fontItems
 * @param {string} detectedTitle - Already-detected title (used to skip title text)
 * @returns {string} Detected authors string, or "Unknown Authors"
 */
export function detectAuthorsFromFontData(fontItems, detectedTitle = "") {
  if (!fontItems || fontItems.length === 0) return "Unknown Authors";

  const valid = fontItems.filter(i => i.str && i.str.trim().length > 0);
  if (valid.length === 0) return "Unknown Authors";

  // --- Step 1: Find the title's Y-position range ---
  const maxY = Math.max(...valid.map(i => i.y));
  const minY = Math.min(...valid.map(i => i.y));
  const pageHeight = maxY - minY;
  if (pageHeight < 50) return "Unknown Authors";

  // Title items: largest font in top 55% of page
  const topItems = valid.filter(i => i.y >= minY + pageHeight * 0.45);
  if (topItems.length === 0) return "Unknown Authors";
  const titleHeight = Math.max(...topItems.map(i => i.height));
  const titleItems = topItems.filter(i => i.height >= titleHeight - 2);
  const titleBottomY = Math.min(...titleItems.map(i => i.y)); // lowest title line (in PDF Y coords, lower = smaller Y)

  // --- Step 2: Find the abstract/intro Y-position (marks author zone end) ---
  const abstractPatterns = [
    /^abstract$/i,
    /^1\.?\s*introduction$/i,
    /^keywords?:?$/i,
    /^i\.\s*introduction$/i,
  ];
  let abstractY = minY; // fallback: bottom of page
  for (const item of valid) {
    if (abstractPatterns.some(p => p.test(item.str.trim()))) {
      abstractY = item.y;
      break;
    }
  }
  // If no abstract found, use 35% down from title
  if (abstractY <= minY) {
    abstractY = titleBottomY - pageHeight * 0.35;
  }

  // --- Step 3: Collect all text between title bottom and abstract ---
  // Author zone: below title (Y < titleBottomY) and above abstract (Y > abstractY)
  const authorZone = valid.filter(i => {
    return i.y < titleBottomY - 3 && i.y > abstractY + 3;
  });

  if (authorZone.length === 0) return "Unknown Authors";

  // --- Step 4: Filter out non-author items ---
  const skipPatterns = [
    /doi:/i,
    /https?:\/\//i,
    /©|copyright/i,
    /received:|accepted:|published:|revised:|edited\s+by|submitted/i,
    /correspondence|email:|e-mail/i,
    /^abstract$/i,
    /^keywords?:?$/i,
    /university|institute|department|school|college|laboratory|center|centre/i,
    /faculty\s+of|school\s+of|dept\.|department\s+of/i,
    /journal\s+of|proceedings|conference\s+on|transactions/i,
    /vol\.|issue\s+|pp\.|issn|isbn/i,
    /mdpi|elsevier|springer|wiley|ieee|acm|arxiv|orcid/i,
    /@/, // email addresses
    /article|open\s+access|creative\s+commons|license/i,
    /^\d+$/, // pure numbers
    /^\*+$/, // pure asterisks
    /orcid\.org/i,
    /^\(?\d{4}\)?$/, // year
  ];

  const authorCandidates = authorZone.filter(i => {
    const text = i.str.trim();
    if (text.length < 2) return false;
    if (skipPatterns.some(p => p.test(text))) return false;
    return true;
  });

  if (authorCandidates.length === 0) return "Unknown Authors";

  // --- Step 5: Group into lines by Y proximity ---
  const lines = [];
  const sortedCandidates = [...authorCandidates].sort((a, b) => b.y - a.y || a.x - b.x);

  for (const item of sortedCandidates) {
    const existingLine = lines.find(l => Math.abs(l.y - item.y) < 5);
    if (existingLine) {
      existingLine.parts.push(item);
    } else {
      lines.push({ y: item.y, parts: [item] });
    }
  }

  // Sort lines top-to-bottom (descending Y in PDF coords)
  lines.sort((a, b) => b.y - a.y);

  // --- Step 6: Score lines — prefer lines with name-like text ---
  // A "name line" typically has capitalized words, commas, "and", no long sentences
  const nameLinePattern = /^[A-Z\u00C0-\u024F][a-z\u00C0-\u024F]+/; // starts with capitalized word
  const scoredLines = lines.map(line => {
    const text = line.parts
      .sort((a, b) => a.x - b.x)
      .map(p => p.str.trim())
      .filter(Boolean)
      .join(" ");
    
    let score = 0;
    // Bonus: contains comma (author separator)
    if (/,/.test(text)) score += 2;
    // Bonus: contains "and" (author connector)
    if (/\band\b/i.test(text)) score += 2;
    // Bonus: starts with capital letter
    if (nameLinePattern.test(text)) score += 1;
    // Bonus: short-ish line (names are typically < 200 chars)
    if (text.length < 200) score += 1;
    // Penalty: looks like an affiliation (long text with institution keywords)
    if (text.length > 100 && /[a-z]{15,}/.test(text)) score -= 3;

    return { text, score, y: line.y };
  });

  // Take lines with score >= 1, up to 3 lines
  const authorLines = scoredLines
    .filter(l => l.score >= 1 && l.text.length > 2)
    .slice(0, 3)
    .map(l => l.text);

  // Fallback: just take the first 2 lines if scoring found nothing
  if (authorLines.length === 0) {
    const fallback = scoredLines.slice(0, 2).map(l => l.text).filter(t => t.length > 2);
    if (fallback.length === 0) return "Unknown Authors";
    authorLines.push(...fallback);
  }

  // --- Step 7: Clean up the raw author string ---
  let authorsRaw = authorLines.join(", ").replace(/\s+/g, " ").trim();

  // Remove superscripts, daggers, section marks
  authorsRaw = authorsRaw
    .replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰†‡§∥¶⊥]/g, "")
    .replace(/\s*[*†‡]+\s*/g, " ")
    // Remove inline superscript numbers like "Author1,2" or "Author 1"
    .replace(/([A-Za-z])\s*(\d{1,2})\s*(?=[,\s]|$)/g, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*,/g, ",") // double commas
    .replace(/^[,\s]+|[,\s]+$/g, "") // leading/trailing
    .trim();

  if (authorsRaw.length < 3 || authorsRaw.length > 500) return "Unknown Authors";

  return authorsRaw;
}

/**
 * Parses a PDF file and returns its pages, text content, and first-page font data for title detection.
 * @param {File} file File object from uploader
 * @param {Function} [onProgress] Progress callback: (pageNumber, totalPages) => void
 * @returns {Promise<{title: string, pageCount: number, pages: Array<{page: number, text: string}>, firstPageFontItems: Array}>}
 */
export async function parsePdfFile(file, onProgress) {
  const pdfjsLib = await loadPdfJS();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        const arrayBuffer = event.target.result;

        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        const pageCount = pdf.numPages;
        const pages = [];
        let firstPageFontItems = [];

        for (let i = 1; i <= pageCount; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();

          // Reconstruct text with line breaks (Y-coordinate based)
          let text = "";
          let lastY = null;

          for (let idx = 0; idx < textContent.items.length; idx++) {
            const item = textContent.items[idx];
            const currentY = item.transform[5];

            if (lastY !== null && Math.abs(currentY - lastY) > 5) {
              text += "\n" + item.str;
            } else {
              text += (text === "" || text.endsWith("\n") ? "" : " ") + item.str;
            }
            lastY = currentY;
          }

          pages.push({ page: i, text: text.trim() });

          // Capture rich font-size data for first page only (for title detection)
          if (i === 1) {
            firstPageFontItems = textContent.items.map((item) => ({
              str: item.str,
              // height from the transform matrix scale, or item.height
              height: item.height || Math.abs(item.transform[3]) || 0,
              y: item.transform[5], // vertical position
              x: item.transform[4], // horizontal position
            }));
          }

          if (onProgress) onProgress(i, pageCount);
        }

        resolve({
          title: file.name.replace(/\.[^/.]+$/, ""), // filename fallback
          pageCount,
          pages,
          firstPageFontItems,
        });
      } catch (error) {
        console.error("PDF Parsing Error:", error);
        reject(new Error("Could not parse PDF content: " + error.message));
      }
    };

    reader.onerror = (err) => {
      reject(new Error("FileReader failed: " + err.message));
    };

    reader.readAsArrayBuffer(file);
  });
}
