const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const pool = require('../config/db');
const { loadEmbedder } = require('./embedding');
const { runPipeline } = require('./pipeline');
async function main() {
  let embedder;
  try {
    const start = performance.now();
    console.log('Đang tải model local (lần đầu cần tải artifact công khai)...');
    embedder = await loadEmbedder();
    const modelLoadMs = performance.now() - start;
    const { summary } = await runPipeline(pool, embedder);
    // Báo cáo CLI riêng để không ghi đè báo cáo kiểm thử đã xác minh.
    const target = path.resolve(__dirname, '../../.cache/rag/experiment-summary.json');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify({ ...summary, modelLoadMs }, null, 2) + '\n');
    console.log(JSON.stringify({ articleCount: summary.articleCount, chunkCount: summary.chunkCount, dimension: summary.embedding.dimension, processingTimeMs: summary.processingTimeMs, report: target }));
  } finally { if (embedder) await embedder.dispose(); await pool.end(); }
}
main().catch(error => { console.error('Thực nghiệm thất bại:', error.code || error.name); process.exitCode = 1; });
