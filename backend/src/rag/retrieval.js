const { performance } = require('node:perf_hooks');
const { DIMENSION, MAX_TOKENS } = require('./config');
const { DEFAULT_K, DEFAULT_THRESHOLD } = require('./retrievalConfig');
const { normalizeText } = require('./text');
const { validateVector } = require('./embedding');

function queryText(question) {
  const normalized = normalizeText(question);
  if (!normalized) throw new Error('Câu hỏi không được rỗng.');
  return `query: ${normalized}`;
}
function vectorNorm(vector) {
  if (!Array.isArray(vector) || vector.length !== DIMENSION || !vector.every(x => typeof x === 'number' && Number.isFinite(x))) throw new Error('Vector phải có 384 số hữu hạn.');
  const norm = Math.hypot(...vector);
  if (!Number.isFinite(norm) || norm === 0) throw new Error('Norm vector không hợp lệ.');
  return norm;
}
function cosineSimilarity(a, b) {
  const normA = vectorNorm(a), normB = vectorNorm(b);
  // Chia từng thành phần trước để tránh overflow với vector chưa normalize.
  const score = a.reduce((sum, value, i) => sum + (value / normA) * (b[i] / normB), 0);
  if (!Number.isFinite(score)) throw new Error('Cosine không hữu hạn.');
  return Math.max(-1, Math.min(1, score));
}
function validateK(k) {
  if (!Number.isSafeInteger(k) || k <= 0) throw new Error('K phải là số nguyên dương.');
}
function validateThreshold(threshold) {
  if (threshold !== null && (typeof threshold !== 'number' || !Number.isFinite(threshold) || threshold < -1 || threshold > 1)) throw new Error('Threshold phải thuộc [-1, 1] hoặc null.');
}
function accepts(score, threshold) {
  validateThreshold(threshold);
  if (!Number.isFinite(score)) throw new Error('Điểm không hữu hạn.');
  return threshold === null ? null : score >= threshold;
}
function compare(a, b) {
  return b.similarity - a.similarity || a.articleId - b.articleId || a.chunkIndex - b.chunkIndex;
}
function rankChunks(queryVector, vectors) {
  vectorNorm(queryVector);
  if (!Array.isArray(vectors)) throw new Error('Index phải là mảng chunk vector.');
  const keys = new Set();
  const articleMetadata = new Map();
  const results = vectors.map(chunk => {
    if (!Number.isSafeInteger(chunk.article_id) || chunk.article_id <= 0 || !Number.isSafeInteger(chunk.chunk_index) || chunk.chunk_index < 0 || chunk.status !== 'PUBLISHED' || !chunk.code?.trim() || !chunk.title?.trim() || !chunk.chunk_text?.trim()) throw new Error('Metadata chunk không hợp lệ.');
    const key = `${chunk.article_id}:${chunk.chunk_index}`;
    if (keys.has(key)) throw new Error('Chunk bị trùng định danh.');
    keys.add(key);
    const identity = JSON.stringify([chunk.code, chunk.title]);
    if (articleMetadata.has(chunk.article_id) && articleMetadata.get(chunk.article_id) !== identity) throw new Error('Metadata article không nhất quán.');
    articleMetadata.set(chunk.article_id, identity);
    return { similarity: cosineSimilarity(queryVector, chunk.embedding), articleId: chunk.article_id,
      code: chunk.code, title: chunk.title, status: chunk.status, chunkIndex: chunk.chunk_index, text: chunk.chunk_text };
  });
  return results.sort(compare).map((result, index) => ({ rank: index + 1, ...result }));
}
function aggregateArticles(rankedChunks) {
  // Max trên TOÀN BỘ chunk, không khử trùng riêng Top-K đã cắt.
  const best = new Map();
  for (const chunk of rankedChunks) {
    const current = best.get(chunk.articleId);
    if (!current || compare(chunk, current) < 0) best.set(chunk.articleId, chunk);
  }
  return [...best.values()].sort(compare).map((chunk, index) => ({ ...chunk, rank: index + 1 }));
}
async function retrieve({ question, vectors, embedder, k = DEFAULT_K, threshold = DEFAULT_THRESHOLD }) {
  const started = performance.now();
  validateK(k); validateThreshold(threshold);
  const input = queryText(question);
  const tokenCount = embedder.countTokens(input);
  if (tokenCount > MAX_TOKENS) throw new Error('Câu hỏi vượt ngân sách token; không cắt ngầm.');
  const embeddingStart = performance.now();
  const queryVector = await embedder.embed(input);
  validateVector(queryVector);
  const queryEmbeddingMs = performance.now() - embeddingStart;
  const searchStart = performance.now();
  const chunks = rankChunks(queryVector, vectors);
  const articles = aggregateArticles(chunks);
  const topChunks = chunks.slice(0, k), topArticles = articles.slice(0, k);
  const accepted = topChunks.length ? accepts(topChunks[0].similarity, threshold) : false;
  const searchMs = performance.now() - searchStart;
  return { normalizedQuestion: input.slice('query: '.length), queryTokenCount: tokenCount,
    topChunks, topArticles, threshold, accepted,
    queryValidation: { dimension: queryVector.length, finite: true, l2: true },
    timing: { queryEmbeddingMs, searchMs, totalMs: performance.now() - started } };
}
module.exports = { queryText, cosineSimilarity, rankChunks, aggregateArticles, accepts, retrieve };