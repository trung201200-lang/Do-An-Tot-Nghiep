const assert = require('node:assert/strict');
const { normalizeText, chunkArticle, validateCoverage } = require('../src/rag/text');
const { validateVector } = require('../src/rag/embedding');
const { readPublished } = require('../src/rag/pipeline');
async function runLogic() {
  const results = [];
  async function check(name, action) { await action(); results.push({ name, status: 'PASS' }); }
  const sample = { id: 1, code: 'KB-test', title: 'Hướng dẫn', status: 'PUBLISHED', content: 'Dữ liệu thử.' };
  // Bộ đếm ký tự giả lập chỉ dành cho test nhánh logic, không phải embedding/token thực nghiệm.
  const count = text => Array.from(text).length;
  await check('Chuẩn hóa tiếng Việt/line break, giữ khoảng trắng kỹ thuật', () => {
    const input = '  Tiếng Việt\r\n\r\n\r\nKhông xóa  C:\\Data\t \rLệnh: ping  127.0.0.1  ';
    assert.equal(normalizeText(input.normalize('NFD')), 'Tiếng Việt\n\nKhông xóa  C:\\Data\nLệnh: ping  127.0.0.1');
    assert.equal(normalizeText(normalizeText(input)), normalizeText(input));
  });
  await check('SQL chỉ đọc PUBLISHED bằng tham số', async () => {
    const rows = await readPublished({ execute: async (sql, params) => {
      assert.match(sql, /^SELECT .+ FROM knowledge_articles WHERE status = \? ORDER BY id$/);
      assert.deepEqual(params, ['PUBLISHED']); return [[sample]];
    } });
    assert.deepEqual(rows, [sample]);
  });
  await check('Từ chối DRAFT và ARCHIVED trước chunking', async () => {
    for (const status of ['DRAFT','ARCHIVED']) await assert.rejects(chunkArticle({ ...sample, status }, count), /PUBLISHED/);
  });
  await check('Bài ngắn giữ nguyên một chunk', async () => {
    const chunks = await chunkArticle(sample, count); assert.equal(chunks.length, 1); assert.equal(chunks[0].chunk_text, sample.content);
  });
  await check('Coverage Unicode/emoji/đoạn dài; index/span/overlap và tiến lên', async () => {
    for (const content of ['😀'.repeat(333), ('Dấu tiếng Việt.\n\n').repeat(99), 'x'.repeat(350), ('Lệnh  hai khoảng trắng\n').repeat(50)]) {
      const chunks = await chunkArticle({ ...sample, content }, count, { size: 80, overlap: 20, maxTokens: 90 });
      validateCoverage(normalizeText(content), chunks);
      chunks.forEach((chunk, index) => { assert.equal(chunk.chunk_index, index); assert.ok(Array.from(chunk.chunk_text).length <= 80); assert.ok(chunk.overlap_chars <= 20); if(index) assert.ok(chunk.end > chunks[index-1].end); });
    }
  });
  await check('Ngân sách token hẹp tự chia, không truncation/mất nội dung', async () => {
    const chunks = await chunkArticle({ ...sample, content: 'Thông tin cần giữ nguyên. '.repeat(20) }, count, { size: 80, overlap: 30, maxTokens: 40 });
    assert.ok(chunks.length > 1); assert.ok(chunks.every(chunk => chunk.token_count <= 40));
  });
  await check('Từ chối rỗng/config sai/title vượt ngân sách', async () => {
    await assert.rejects(chunkArticle({ ...sample, content: '   ' }, count));
    await assert.rejects(chunkArticle(sample, count, { size: 20, overlap: 20 }));
    await assert.rejects(chunkArticle(sample, count, { maxTokens: 5 }));
  });
  await check('Validator từ chối NaN, Infinity, sai chiều, string và vector 0', () => {
    for (const vector of [Array(384).fill(0), Array(384).fill(NaN), Array(384).fill(Infinity), Array(384).fill('1'), [1,2]]) assert.throws(() => validateVector(vector));
  });
  return results;
}
module.exports = { runLogic };
if (require.main === module) runLogic().then(results => console.log(JSON.stringify(results,null,2))).catch(error => { console.error(error); process.exitCode=1; });
