const { TOP_K_VALUES, THRESHOLD_POLICY } = require('./retrievalConfig');
const { accepts } = require('./retrieval');
function stats(values) {
  if (!values.length) return { count: 0, min: null, max: null, average: null };
  return { count: values.length, min: Math.min(...values), max: Math.max(...values), average: values.reduce((a,b) => a+b, 0) / values.length };
}
function keywordMatches(question, articles) {
  const keyword = question.trim().toLocaleLowerCase('vi-VN');
  return articles.filter(article => `${article.code} ${article.title}`.toLocaleLowerCase('vi-VN').includes(keyword));
}
function resolveTopics(dataset, articles) {
  return Object.fromEntries(Object.entries(dataset.topics).map(([topic, title]) => {
    const found = articles.filter(article => article.title === title && article.status === 'PUBLISHED');
    if (found.length !== 1) throw new Error(`Không ánh xạ duy nhất được topic: ${topic}`);
    return [topic, { articleId: found[0].id, code: found[0].code, title }];
  }));
}
function evaluateQuestion(question, result, mapping) {
  const expected = question.expectedTopics.map(topic => {
    if (!mapping[topic]) throw new Error('Topic không tồn tại trong corpus.');
    return mapping[topic];
  });
  const expectedIds = new Set(expected.map(a => a.articleId));
  const topK = {};
  for (const k of TOP_K_VALUES) {
    const chunks = result.topChunks.slice(0,k), articles = result.topArticles.slice(0,k);
    topK[k] = {
      chunkRefs: chunks.map(c => ({ articleId: c.articleId, chunkIndex: c.chunkIndex, similarity: c.similarity })),
      articleRefs: articles.map(c => ({ articleId: c.articleId, chunkIndex: c.chunkIndex, similarity: c.similarity })),
      distinctArticlesInChunks: new Set(chunks.map(c => c.articleId)).size,
      chunkHit: expected.length ? chunks.some(c => expectedIds.has(c.articleId)) : null,
      articleHit: expected.length ? articles.some(c => expectedIds.has(c.articleId)) : null,
    };
  }
  return { ...question, expected, ...result, topK,
    rubric: question.group === 'PARTIAL' ? 'Chỉ chấm ứng viên chủ đề; chưa đủ bằng chứng trả lời toàn bộ.' : question.group === 'OUT_OF_KB' ? 'Phải reject nguồn làm căn cứ trả lời.' : 'Có nguồn kỳ vọng trong KB.' };
}
function hitMetrics(questions) {
  const rows = questions.filter(q => q.expected.length);
  const calculate = kind => Object.fromEntries(TOP_K_VALUES.map(k => {
    const hits = rows.filter(q => q.topK[k][kind]).length;
    return [k === 1 ? 'top1Accuracy' : `hitRateAt${k}`, { hits, total: rows.length, rate: rows.length ? hits / rows.length : null }];
  }));
  return { chunkLevel: calculate('chunkHit'), articleLevel: calculate('articleHit') };
}
function metrics(questions) {
  return Object.fromEntries(['ALL','DEV','TEST'].map(split => {
    const rows = questions.filter(q => split === 'ALL' || q.split === split);
    return [split, {
      // Yêu cầu GĐ5.3: 20 câu có expected; GĐ5.1: 16 câu A/B, báo riêng.
      inKbWithExpected: hitMetrics(rows),
      strictDirectParaphrase: hitMetrics(rows.filter(q => ['DIRECT','PARAPHRASE'].includes(q.group))),
      groups: Object.fromEntries(['DIRECT','PARAPHRASE','PARTIAL'].map(group => [group, hitMetrics(rows.filter(q => q.group === group))])),
    }];
  }));
}
function thresholdCounts(questions, threshold) {
  const inside = questions.filter(q => q.expected.length);
  const outside = questions.filter(q => !q.expected.length);
  const isAccepted = q => accepts(q.topArticles[0].similarity, threshold);
  const inAccepted = inside.filter(isAccepted);
  const outAccepted = outside.filter(isAccepted);
  return { threshold, inKbTotal: inside.length, inKbAccepted: inAccepted.length,
    inKbRejectedWrong: inside.length - inAccepted.length,
    inKbAcceptedCorrectTop1: inAccepted.filter(q => q.topK[1].articleHit).length,
    inKbAcceptedWrongTop1: inAccepted.filter(q => !q.topK[1].articleHit).length,
    outTotal: outside.length, outRejectedCorrect: outside.length - outAccepted.length, outAcceptedWrong: outAccepted.length,
    partialAccepted: inAccepted.filter(q => q.group === 'PARTIAL').length,
    balancedAccuracy: inside.length && outside.length ? ((inAccepted.length / inside.length) + (1 - outAccepted.length / outside.length)) / 2 : null,
    falsePositiveIds: outAccepted.map(q => q.id), falseNegativeIds: inside.filter(q => !isAccepted(q)).map(q => q.id),
  };
}
function calibrateThreshold(devQuestions) {
  if (!devQuestions.length || devQuestions.some(q => q.split !== 'DEV')) throw new Error('Chỉ được hiệu chỉnh trên DEV.');
  const scores = [...new Set(devQuestions.map(q => q.topArticles[0].similarity))].sort((a,b) => a-b);
  const candidates = [-1, ...scores.slice(1).map((score, i) => (score + scores[i]) / 2), 1];
  const trials = candidates.map(threshold => thresholdCounts(devQuestions, threshold));
  const selected = [...trials].sort((a,b) => b.balancedAccuracy - a.balancedAccuracy || a.outAcceptedWrong - b.outAcceptedWrong || a.threshold - b.threshold)[0];
  return { policy: THRESHOLD_POLICY, candidatesFrom: 'DEV Top-1 score midpoints plus [-1,1] boundaries',
    devScoreDistribution: { inKb: stats(devQuestions.filter(q => q.expected.length).map(q => q.topArticles[0].similarity)), outOfKb: stats(devQuestions.filter(q => !q.expected.length).map(q => q.topArticles[0].similarity)) },
    trials, selectedThreshold: selected.threshold, selectedDevCounts: selected };
}
module.exports = { stats, keywordMatches, resolveTopics, evaluateQuestion, hitMetrics, metrics, thresholdCounts, calibrateThreshold };