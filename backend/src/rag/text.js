const { CHUNK_SIZE, CHUNK_OVERLAP, MAX_TOKENS } = require('./config');
function normalizeText(text) {
  if (typeof text !== 'string') throw new TypeError('Văn bản phải là chuỗi.');
  return text.normalize('NFC').replace(/\r\n?/g, '\n').replace(/[\t ]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
}
const embeddingText = (title, text) => `passage: ${title}\n${text}`;
const white = char => /\s/u.test(char);
// Chọn ranh giới xa nhất, nhưng luôn thêm nội dung mới ngoài overlap.
function boundary(chars, start, limit, covered) {
  if (limit === chars.length) return limit;
  let floor = Math.max(start, covered);
  while (floor < chars.length && white(chars[floor])) floor++;
  for (const kind of ['paragraph', 'line', 'space']) {
    for (let end = limit; end > floor; end--) {
      if (kind === 'paragraph' && chars[end - 1] === '\n' && chars[end] === '\n') return end;
      if (kind === 'line' && chars[end - 1] === '\n') return end;
      if (kind === 'space' && white(chars[end])) return end;
    }
  }
  return limit;
}
async function chunkArticle(article, countTokens, config = {}) {
  const size = config.size ?? CHUNK_SIZE, overlap = config.overlap ?? CHUNK_OVERLAP;
  const maxTokens = config.maxTokens ?? MAX_TOKENS;
  if (!Number.isInteger(size) || size < 1 || !Number.isInteger(overlap) || overlap < 0 || overlap >= size || !Number.isInteger(maxTokens) || maxTokens < 1) throw new Error('Cấu hình chunk không hợp lệ.');
  if (article.status !== 'PUBLISHED') throw new Error('Chỉ xử lý bài PUBLISHED.');
  if (!Number.isInteger(article.id) || article.id < 1 || !article.code?.trim() || !article.title?.trim()) throw new Error('Metadata bài không hợp lệ.');
  const title = normalizeText(article.title), normalized = normalizeText(article.content);
  if (!normalized) throw new Error('Nội dung bài rỗng.');
  if (await countTokens(embeddingText(title, '')) >= maxTokens) throw new Error('Tiêu đề/prefix vượt ngân sách token.');
  const chars = Array.from(normalized), chunks = [];
  let start = 0, covered = 0;
  while (covered < chars.length) {
    while (start < chars.length && white(chars[start])) start++;
    if (start === chars.length) break;
    let end = boundary(chars, start, Math.min(start + size, chars.length), covered);
    let text, tokens;
    while (end > Math.max(start, covered)) {
      text = chars.slice(start, end).join('').trimEnd();
      if (start + Array.from(text).length <= covered) { end = covered; break; }
      tokens = await countTokens(embeddingText(title, text));
      if (tokens <= maxTokens) break;
      end = boundary(chars, start, end - 1, covered);
    }
    if (end <= Math.max(start, covered)) {
      if (start < covered) { start = covered; continue; }
      throw new Error('Không thể chứa nội dung mới trong ngân sách token.');
    }
    end = start + Array.from(text).length;
    if (!text || end <= covered) throw new Error('Chunk không tiến lên.');
    chunks.push({ article_id: article.id, code: article.code, title: article.title, status: article.status,
      chunk_index: chunks.length, chunk_text: text, start, end, token_count: tokens,
      overlap_chars: Math.max(0, covered - start) });
    covered = end;
    if (chars.slice(covered).every(white)) break;
    start = Math.max(start + 1, end - overlap);
    // Dời đầu overlap đến ranh giới từ; không bao giờ bỏ phần chưa được phủ.
    while (start < end && start > 0 && !white(chars[start - 1])) start++;
  }
  validateCoverage(normalized, chunks);
  return chunks;
}
function validateCoverage(normalized, chunks) {
  const chars = Array.from(normalized), seen = new Uint8Array(chars.length);
  for (const chunk of chunks) {
    if (chunk.start < 0 || chunk.end > chars.length || chunk.start >= chunk.end || chars.slice(chunk.start, chunk.end).join('') !== chunk.chunk_text) throw new Error('Span chunk không khớp nguồn.');
    seen.fill(1, chunk.start, chunk.end);
  }
  if (!chunks.length || chars.some((char, i) => !white(char) && !seen[i])) throw new Error('Chunk làm mất nội dung nguồn.');
}
module.exports = { normalizeText, embeddingText, chunkArticle, validateCoverage };
