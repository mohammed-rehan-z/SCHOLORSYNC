/**
 * Client-Side RAG Engine for Research Paper Analysis
 */

/**
 * Clean and tokenize text
 * @param {string} text 
 * @returns {string[]}
 */
export function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s\-\']/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 2); // Exclude short stop words/noise
}

/**
 * Creates sliding-window chunks from a document page's text
 * @param {string} pageText Text extracted from a single page
 * @param {number} pageNumber The page number of this text
 * @param {string} paperId The associated paper ID
 * @param {number} chunkSize Maximum characters per chunk
 * @param {number} overlap Characters overlap between chunks
 * @returns {Array<{id: string, paperId: string, page: number, content: string}>}
 */
export function chunkPageText(pageText, pageNumber, paperId, chunkSize = 800, overlap = 150) {
  const chunks = [];
  if (!pageText || pageText.trim().length === 0) return chunks;

  let start = 0;
  let chunkIndex = 0;

  while (start < pageText.length) {
    const end = Math.min(start + chunkSize, pageText.length);
    let content = pageText.substring(start, end);

    // Try to adjust chunk boundary to end on a complete word
    if (end < pageText.length) {
      const lastSpace = content.lastIndexOf(' ');
      if (lastSpace > chunkSize * 0.7) {
        content = content.substring(0, lastSpace);
        start += lastSpace - overlap;
      } else {
        start += chunkSize - overlap;
      }
    } else {
      start = end; // Finished page
    }

    if (content.trim().length > 20) {
      chunks.push({
        id: `${paperId}-p${pageNumber}-c${chunkIndex++}`,
        paperId,
        page: pageNumber,
        content: content.trim()
      });
    }

    if (overlap >= chunkSize) {
      start += chunkSize; // Avoid infinite loop
    }
  }

  return chunks;
}

/**
 * Scores and retrieves top-K relevant chunks using TF-IDF-based cosine similarity
 * @param {string} query The user's question
 * @param {Array<{id: string, content: string, page: number}>} chunks All chunks for the paper
 * @param {number} topK Number of chunks to return
 * @returns {Array<{chunk: Object, score: number}>}
 */
export function retrieveChunks(query, chunks, topK = 4) {
  if (!query || !chunks || chunks.length === 0) return [];

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    // Fallback: return first few chunks
    return chunks.slice(0, topK).map(chunk => ({ chunk, score: 0 }));
  }

  // Calculate Document Frequency (DF) for IDF calculation
  const totalDocs = chunks.length;
  const df = {};
  
  chunks.forEach(doc => {
    const tokens = new Set(tokenize(doc.content));
    tokens.forEach(token => {
      df[token] = (df[token] || 0) + 1;
    });
  });

  // Calculate TF-IDF vectors for documents
  const docVectors = chunks.map(doc => {
    const tokens = tokenize(doc.content);
    const tf = {};
    tokens.forEach(token => {
      tf[token] = (tf[token] || 0) + 1;
    });

    const vector = {};
    let length = 0;
    
    Object.keys(tf).forEach(token => {
      const idf = Math.log(1 + totalDocs / (df[token] || 1));
      const val = tf[token] * idf;
      vector[token] = val;
      length += val * val;
    });
    
    return {
      doc,
      vector,
      length: Math.sqrt(length)
    };
  });

  // Calculate TF-IDF vector for Query
  const queryTf = {};
  queryTokens.forEach(token => {
    queryTf[token] = (queryTf[token] || 0) + 1;
  });

  const queryVector = {};
  let queryLength = 0;
  
  Object.keys(queryTf).forEach(token => {
    const idf = Math.log(1 + totalDocs / (df[token] || 1));
    const val = queryTf[token] * idf;
    queryVector[token] = val;
    queryLength += val * val;
  });
  queryLength = Math.sqrt(queryLength);

  // Calculate Cosine Similarity
  const scored = docVectors.map(docVec => {
    let dotProduct = 0;
    
    Object.keys(queryVector).forEach(token => {
      if (docVec.vector[token]) {
        dotProduct += queryVector[token] * docVec.vector[token];
      }
    });

    const similarity = (queryLength > 0 && docVec.length > 0) 
      ? dotProduct / (queryLength * docVec.length) 
      : 0;

    return {
      chunk: docVec.doc,
      score: similarity
    };
  });

  // Sort and return top K
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
