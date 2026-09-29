const { performance } = require('node:perf_hooks');
const { createHash } = require('node:crypto');
const os = require('node:os');
const config = require('./config');
const { normalizeText, embeddingText, chunkArticle, validateCoverage } = require('./text');
const { validateVector } = require('./embedding');
const PUBLISHED_SQL = 'SELECT id, code, title, content, status, updated_at FROM knowledge_articles WHERE status = ? ORDER BY id';
async function readPublished(db) { return (await db.execute(PUBLISHED_SQL, ['PUBLISHED']))[0]; }
async function runPipeline(db, embedder) {
  const started = performance.now();
  const articles = await readPublished(db);
  const readMs = performance.now() - started;
  if (!articles.length) throw new Error('Không có bài PUBLISHED để thực nghiệm.');
  let tick = performance.now();
  const prepared = articles.map(article => ({ ...article, content: normalizeText(article.content) }));
  const preprocessingMs = performance.now() - tick;
  tick = performance.now();
  const chunks = [];
  for (const article of prepared) chunks.push(...await chunkArticle(article, embedder.countTokens));
  const chunkingMs = performance.now() - tick;
  tick = performance.now();
  const vectors = [];
  for (const chunk of chunks) vectors.push({ ...chunk, embedding: await embedder.embed(embeddingText(normalizeText(chunk.title), chunk.chunk_text)) });
  const embeddingMs = performance.now() - tick;
  tick = performance.now();
  for (const vector of vectors) validateVector(vector.embedding);
  for (const article of prepared) validateCoverage(article.content, chunks.filter(chunk => chunk.article_id === article.id));
  const validationMs = performance.now() - tick;
  const lengths = chunks.map(chunk => Array.from(chunk.chunk_text).length);
  const summary = {
    timestamp: new Date().toISOString(), articleCount: articles.length, chunkCount: chunks.length,
    chunkConfiguration: { method: 'paragraph-first with length/token limit', size: config.CHUNK_SIZE, overlap: config.CHUNK_OVERLAP, unit: 'Unicode code point', maxInputTokens: config.MAX_TOKENS },
    embedding: { provider: 'local CPU', model: config.MODEL, baseModel: 'intfloat/multilingual-e5-small', revision: config.REVISION, dtype: config.DTYPE, artifact: 'onnx/model_quantized.onnx', dimension: config.DIMENSION, pooling: 'attention-mask mean + L2', apiKey: false, library: require('../../package.json').dependencies['@huggingface/transformers'] },
    environment: { node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model, ramBytes: os.totalmem() },
    processingTimeMs: { read: readMs, preprocessing: preprocessingMs, chunking: chunkingMs, embedding: embeddingMs, validation: validationMs, total: performance.now() - started },
    chunkLengths: { min: Math.min(...lengths), max: Math.max(...lengths), mean: lengths.reduce((a,b) => a+b, 0) / lengths.length },
    articles: articles.map(article => ({ article_id: article.id, code: article.code, title: article.title, status: article.status,
      sourceHash: createHash('sha256').update(article.title + '\n' + article.content).digest('hex'),
      chunks: chunks.filter(chunk => chunk.article_id === article.id).map(chunk => ({ index: chunk.chunk_index, characters: Array.from(chunk.chunk_text).length, tokens: chunk.token_count, start: chunk.start, end: chunk.end, overlap: chunk.overlap_chars })) })),
    examples: chunks.filter(chunk => chunk.article_id === articles[0].id),
    vectorSample: { article_id: vectors[0].article_id, chunk_index: 0, first8: vectors[0].embedding.slice(0,8), norm: validateVector(vectors[0].embedding) },
    validation: { status: 'PASS', fullCoverage: true, finiteVectors: true, dimension: config.DIMENSION },
  };
  return { articles, chunks, vectors, summary };
}
module.exports = { PUBLISHED_SQL, readPublished, runPipeline };
