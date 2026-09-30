const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { queryText, cosineSimilarity, rankChunks, aggregateArticles, accepts, retrieve } = require('../src/rag/retrieval');
const { keywordMatches, calibrateThreshold, thresholdCounts, hitMetrics } = require('../src/rag/retrievalEvaluation');
const dataset = require('../src/rag/retrievalQuestions.json');
async function runLogic() {
  const tests = [];
  async function check(test, name, action) { await action(); tests.push({ test, name, status: 'PASS', mode: 'logic fixture' }); }
  const axis = position => Array.from({ length: 384 }, (_,i) => +(i === position));
  const base = { article_id: 8, code: 'KB-fixture', title: 'Bài thử', status: 'PUBLISHED', chunk_index: 0, chunk_text: 'Nội dung thử', embedding: axis(0) };
  const vectors = [ { ...base, chunk_index: 1 }, { ...base, article_id: 9, code: 'KB-other', embedding: axis(1) }, base ];
  const embedder = { countTokens: () => 10, embed: async text => { assert.ok(text.startsWith('query: ')); return axis(0); } };
  const args = { question: 'Câu hỏi tiếng Việt', vectors, embedder };
  await check(4, 'Cosine với chính nó gần 1; trực giao 0; đối hướng -1; vector chưa L2', () => {
    assert.ok(Math.abs(cosineSimilarity(axis(0),axis(0))-1)<1e-10);
    assert.equal(cosineSimilarity(axis(0),axis(1)),0);
    assert.equal(cosineSimilarity(axis(0),axis(0).map(x=>-x)),-1);
    assert.equal(cosineSimilarity(axis(0).map(x=>3*x),axis(0).map(x=>9*x)),1);
  });
  await check(5, 'Ranking giảm dần', () => { const r=rankChunks(axis(0),vectors); assert.ok(r.every((x,i)=>!i||r[i-1].similarity>=x.similarity)); });
  await check(6, 'Top-K đủ số lượng khi đủ chunk', async () => assert.equal((await retrieve({...args,k:2})).topChunks.length,2));
  await check(7, 'K lớn hơn index và index rỗng xử lý an toàn', async () => {
    assert.equal((await retrieve({...args,k:99})).topChunks.length,3);
    const empty=await retrieve({...args,vectors:[]});assert.deepEqual(empty.topChunks,[]);assert.equal(empty.accepted,false);
  });
  await check(8, 'K không phải số nguyên dương bị từ chối', async () => { for(const k of [0,-1,1.5,NaN,Infinity,'3'])await assert.rejects(retrieve({...args,k})); });
  await check(9, 'Câu hỏi rỗng hoặc sai kiểu bị từ chối', async () => { for(const question of ['', ' \n ',null,2])await assert.rejects(retrieve({...args,question})); });
  await check(10, 'Metadata nguồn nguyên vẹn; không trả embedding', async () => {
    const row=(await retrieve(args)).topChunks[0];assert.deepEqual(row,{rank:1,similarity:1,articleId:8,code:base.code,title:base.title,status:base.status,chunkIndex:0,text:base.chunk_text});assert.ok(!('embedding' in row));
  });
  await check(11, 'Rank bắt đầu 1 và liên tiếp', () => assert.deepEqual(rankChunks(axis(0),vectors).map(x=>x.rank),[1,2,3]));
  await check(12, 'Tie deterministic theo articleId/chunkIndex, độc lập thứ tự input', () => {
    const r=rankChunks(axis(0),vectors);assert.deepEqual(r,rankChunks(axis(0),[...vectors].reverse()));assert.deepEqual(r.slice(0,2).map(x=>[x.articleId,x.chunkIndex]),[[8,0],[8,1]]);
  });
  await check(13, 'Aggregation max toàn index; chunk trùng không chiếm chỗ article', () => {
    const ranked=rankChunks(axis(0),vectors);const articles=aggregateArticles([...ranked].reverse());assert.deepEqual(articles.map(x=>[x.articleId,x.chunkIndex,x.rank]),[[8,0,1],[9,0,2]]);
    assert.equal(new Set(ranked.slice(0,2).map(x=>x.articleId)).size,1);assert.equal(articles.slice(0,2).length,2);
  });
  await check(14, 'Threshold bao gồm biên bằng ngưỡng và validation', () => {
    assert.equal(accepts(0.7,0.7),true);assert.equal(accepts(0.69,0.7),false);assert.equal(accepts(0.7,null),null);
    for(const t of [NaN,Infinity,2,-2,'0.7'])assert.throws(()=>accepts(0.8,t));
  });
  await check(15, 'Retrieval không sửa input vectors', async () => {const before=structuredClone(vectors);await retrieve(args);assert.deepEqual(vectors,before);});
  await check(16, 'Giữ tiếng Việt NFC và prefix query chính xác', () => assert.equal(queryText('  Câu hỏi tiếng Việt\r\nIP 127.0.0.1  '.normalize('NFD')),'query: Câu hỏi tiếng Việt\nIP 127.0.0.1'));
  await check('B1', 'Chặn vector sai/zero/nonfinite và query quá ngân sách', async () => {
    for(const v of [[],Array(384).fill(0),Array(384).fill(NaN),Array(384).fill(Infinity),Array(384).fill('1')])assert.throws(()=>cosineSimilarity(v,axis(0)));
    await assert.rejects(retrieve({...args,embedder:{...embedder,countTokens:()=>513}}));
    assert.throws(()=>rankChunks(axis(0),[base,{...base}]));assert.throws(()=>rankChunks(axis(0),[{...base,status:'DRAFT'}]));
  });
  await check('B2', '24 câu/nhãn/split giữ đúng Markdown GĐ5.1', () => {
    const md=fs.readFileSync(path.resolve(__dirname,'../../docs/giai-doan-5-1.md'),'utf8');
    const rows=md.split(/\r?\n/).filter(line=>/^\| [ABCD]\d{2} \|/.test(line));assert.equal(rows.length,24);assert.equal(dataset.questions.length,24);
    rows.forEach((line,i)=>{const c=line.split('|').map(x=>x.trim());const q=dataset.questions[i];assert.equal(q.id,c[1]);assert.equal(q.question,c[3]);
      const expected=c[2]==='D'?[]:c[4].replace(/ \(chỉ (?:hướng dẫn|liên quan) chung\)/,'').split(';').map(x=>x.trim());assert.deepEqual(q.expectedTopics,expected);
      assert.equal(q.split,/^(A0[1-4]|B0[5-8]|C0[12]|D0[12])$/.test(q.id)?'DEV':'TEST');});
    assert.equal(dataset.questions.filter(q=>q.split==='DEV').length,12);
    assert.deepEqual(dataset.questions.find(q=>q.id==='C04').expectedTopics,['email']);
  });
  await check('B3', 'Metric không gộp OUT; chọn threshold chỉ DEV, đếm FP/FN đúng', () => {
    const fixture=(id,score,inside,hit)=>({id,split:'DEV',group:inside?'DIRECT':'OUT_OF_KB',expected:inside?[{}]:[],topArticles:[{similarity:score}],topK:Object.fromEntries([1,3,5].map(k=>[k,{articleHit:hit,chunkHit:hit}]))});
    const rows=[fixture('a',0.9,true,true),fixture('b',0.7,true,false),fixture('d',0.8,false,null)];
    assert.equal(hitMetrics(rows).articleLevel.top1Accuracy.rate,0.5);
    const counts=thresholdCounts(rows,0.85);assert.equal(counts.inKbRejectedWrong,1);assert.equal(counts.outRejectedCorrect,1);
    const calibrated=calibrateThreshold(rows);assert.ok(Math.abs(calibrated.selectedThreshold-0.85)<1e-10);
    assert.throws(()=>calibrateThreshold([{...rows[0],split:'TEST'}]));
  });
  await check('B4', 'Keyword baseline giữ phép includes trên code + title như frontend', () => {
    const articles=[{code:'KB-test',title:'Tiếng Việt'}];
    assert.deepEqual(keywordMatches('  kb-test tiếng  ',articles),articles);
    assert.deepEqual(keywordMatches('Không có',articles),[]);
  });
  return tests;
}
module.exports={runLogic};
if(require.main===module)runLogic().then(tests=>console.log(JSON.stringify(tests,null,2))).catch(error=>{console.error(error);process.exitCode=1;});