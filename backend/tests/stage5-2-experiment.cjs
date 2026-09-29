const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { execFileSync } = require('node:child_process');
const pool = require('../src/config/db');
const { loadEmbedder, validateVector } = require('../src/rag/embedding');
const { runPipeline } = require('../src/rag/pipeline');
const { normalizeText, embeddingText, chunkArticle, validateCoverage } = require('../src/rag/text');
const { runLogic } = require('./stage5-2-logic.cjs');
const root = path.resolve(__dirname, '../..');
const report = { timestamp: new Date().toISOString(), completed: false, tests: [], logicTests: [], regression: [], dataPreserved: false };
const backups = new Map();
let embedder;
async function snapshot() {
  const data = {};
  for (const table of ['users', 'tickets', 'ticket_history', 'knowledge_articles']) [data[table]] = await pool.query(`SELECT * FROM ${table} ORDER BY id`);
  return data;
}
async function check(test, name, work) {
  try { await work(); report.tests.push({ test, name, status: 'PASS' }); console.log(`PASS ${test}: ${name}`); }
  catch (error) { report.tests.push({ test, name, status: 'FAIL' }); throw error; }
}
async function main() {
  assert.notEqual(process.env.NODE_ENV, 'production');
  assert.ok(['127.0.0.1','localhost','::1'].includes(process.env.DB_HOST));
  const before = await snapshot();
  assert.deepEqual(Object.values(before).map(rows => rows.length), [3,3,17,8], 'Dữ liệu khác dự kiến: dừng, không tự xóa.');
  report.logicTests = await runLogic();
  console.log('Đang nạp model E5 local cho integration test...');
  const loadStarted = performance.now();
  embedder = await loadEmbedder();
  report.modelLoadMs = performance.now() - loadStarted;
  const first = await runPipeline(pool, embedder);
  Object.assign(report, first.summary);
  await check(1, 'Chỉ sử dụng PUBLISHED; SQL tham số và chặn trạng thái khác đã kiểm tra logic', () => assert.ok(first.articles.every(a => a.status === 'PUBLISHED')));
  await check(2, 'Dữ liệu hiện tại có 8 article', () => assert.equal(first.articles.length, 8));
  await check(3, 'Preprocessing giữ tiếng Việt và dữ kiện kỹ thuật', () => {
    const text = '  Không xóa dữ liệu\r\nIP: 127.0.0.1  ';
    assert.equal(normalizeText(text.normalize('NFD')), 'Không xóa dữ liệu\nIP: 127.0.0.1');
    report.preprocessingExample = { input: text, output: normalizeText(text) };
  });
  await check(4, 'Không chunk rỗng', () => assert.ok(first.chunks.length && first.chunks.every(c => c.chunk_text.trim())));
  await check(5, 'Mỗi chunk có article_id đúng nguồn', () => assert.ok(first.chunks.every(c => first.articles.some(a => a.id === c.article_id))));
  await check(6, 'Mỗi chunk có code đúng nguồn', () => assert.ok(first.chunks.every(c => c.code === first.articles.find(a => a.id === c.article_id).code)));
  await check(7, 'Mỗi chunk có title đúng nguồn', () => assert.ok(first.chunks.every(c => c.title === first.articles.find(a => a.id === c.article_id).title)));
  await check(8, 'chunk_index liên tiếp từ 0 theo article', () => {
    for (const a of first.articles) assert.deepEqual(first.chunks.filter(c => c.article_id === a.id).map(c => c.chunk_index), Array.from({ length: first.chunks.filter(c => c.article_id === a.id).length }, (_,i) => i));
  });
  await check(9, 'Mọi article được phủ toàn bộ nội dung chuẩn hóa', () => {
    for (const a of first.articles) validateCoverage(normalizeText(a.content), first.chunks.filter(c => c.article_id === a.id));
  });
  await check(10, 'Model thật tạo embedding cho mọi chunk', () => assert.equal(first.vectors.length, first.chunks.length));
  await check(11, 'Embedding là vector số', () => assert.ok(first.vectors.every(v => Array.isArray(v.embedding) && v.embedding.every(n => typeof n === 'number'))));
  await check(12, 'Mọi vector có 384 chiều', () => assert.ok(first.vectors.every(v => v.embedding.length === 384)));
  await check(13, 'Không có NaN', () => assert.ok(first.vectors.every(v => v.embedding.every(n => !Number.isNaN(n)))));
  await check(14, 'Không có Infinity', () => assert.ok(first.vectors.every(v => v.embedding.every(Number.isFinite))));
  await check(15, 'Metadata không đổi sau embedding, L2 hợp lệ', () => {
    first.vectors.forEach((vector, index) => { const { embedding, ...metadata } = vector; assert.deepEqual(metadata, first.chunks[index]); validateVector(embedding); });
  });
  await check('B1', 'Giới hạn ký tự/overlap/token và số token tính trên toàn input thật', () => {
    for (const c of first.chunks) {
      assert.ok(Array.from(c.chunk_text).length <= 800); assert.ok(c.overlap_chars <= 120);
      assert.equal(c.token_count, embedder.countTokens(embeddingText(normalizeText(c.title), c.chunk_text))); assert.ok(c.token_count <= 512);
    }
  });
  await check('B2', 'Tokenizer thật chia tiếp khi input vượt 512 token, giữ coverage', async () => {
    const article = { id: 999, code: 'TOKEN-LOGIC', title: 'Token test', content: '网'.repeat(700), status: 'PUBLISHED' };
    assert.ok(embedder.countTokens(embeddingText(article.title, article.content)) > 512);
    const chunks = await chunkArticle(article, embedder.countTokens);
    assert.ok(chunks.length > 1); assert.ok(chunks.every(c => c.token_count <= 512)); validateCoverage(article.content, chunks);
  });
  await check(16, 'Pipeline lần hai chạy model thật và giữ dữ liệu KB', async () => {
    const second = await runPipeline(pool, embedder);
    assert.deepEqual(second.chunks, first.chunks);
    second.vectors.forEach(v => validateVector(v.embedding));
    assert.deepEqual((await snapshot()).knowledge_articles, before.knowledge_articles);
    report.repeatedRun = { articleCount: second.summary.articleCount, chunkCount: second.summary.chunkCount, processingTimeMs: second.summary.processingTimeMs, validation: second.summary.validation };
  });
  await check(17, 'Toàn bộ dữ liệu nghiệp vụ trước/sau hai lần pipeline không đổi', async () => assert.deepEqual(await snapshot(), before));
  // Hồi quy API phù hợp; không chạy suite 4.5 vì suite đó kiểm tra chưa có embedding.
  for (const [script, resultFile] of [['stage4-2-api.cjs','stage4-2-api-results.json'], ['stage4-2-regression.cjs','stage4-2-regression-results.json']]) {
    const target = path.join(root, 'docs', resultFile); backups.set(target, fs.readFileSync(target));
    execFileSync(process.execPath, [path.join(__dirname, script)], { cwd: path.join(root, 'backend'), stdio: 'inherit', timeout: 180000, windowsHide: true });
    const result = JSON.parse(fs.readFileSync(target, 'utf8'));
    if (result.results) { assert.ok(result.results.every(r => r.status === 'PASS')); assert.equal(result.cleanup, 'PASS'); }
    else { assert.equal(result.dataPreserved, true); assert.ok(result.suites.every(s => s.results.every(r => r.status === 'PASS'))); }
    report.regression.push({ script, result });
  }
  const after = await snapshot(); assert.deepEqual(after, before);
  report.counts = Object.fromEntries(Object.entries(after).map(([name,rows]) => [name,rows.length]));
  report.dataPreserved = true; report.completed = true;
}
main().catch(error => { console.error('GĐ5.2 thất bại:', error.code || error.name, error.message?.slice(0,200)); process.exitCode=1; }).finally(async () => {
  for (const [file, bytes] of backups) fs.writeFileSync(file, bytes);
  fs.writeFileSync(path.join(root, 'docs/stage5-2-results.json'), JSON.stringify(report,null,2) + '\n');
  if (embedder) await embedder.dispose();
  await pool.end();
});
