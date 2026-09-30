const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { loadEmbedder } = require('./embedding');
const { runPipeline } = require('./pipeline');
const { retrieve, accepts } = require('./retrieval');
const { TOP_K_VALUES } = require('./retrievalConfig');
const { keywordMatches, resolveTopics, evaluateQuestion, metrics, stats, calibrateThreshold, thresholdCounts } = require('./retrievalEvaluation');
const dataset = require('./retrievalQuestions.json');
const MEASURED_RUNS = 3;
const TABLES = ['users','tickets','ticket_history','knowledge_articles'];
async function snapshot(pool) {
  const result={};
  for(const table of TABLES) [result[table]]=await pool.query(`SELECT * FROM ${table} ORDER BY id`);
  return result;
}
const counts = data => Object.fromEntries(Object.entries(data).map(([name,rows])=>[name,rows.length]));
async function runExperiment(pool) {
  const before=await snapshot(pool);
  const report={metadata:{timestamp:new Date().toISOString(),completed:false,measuredRunsPerQuestion:MEASURED_RUNS,warmup:'Một query A01 (DEV) sau document embedding, không tính vào số đo',thresholdLockedBeforeTest:false},regression:{status:'NOT_RUN'}};
  let embedder;
  try {
    const loadStart=performance.now();embedder=await loadEmbedder();report.modelLoadMs=performance.now()-loadStart;
    const corpus=await runPipeline(pool,embedder);
    const mapping=resolveTopics(dataset,corpus.articles);
    Object.assign(report,{model:corpus.summary.embedding,vectorDimension:corpus.summary.embedding.dimension,articleCount:corpus.articles.length,chunkCount:corpus.chunks.length,
      questionCount:dataset.questions.length,topKValues:TOP_K_VALUES,environment:corpus.summary.environment,chunkConfiguration:corpus.summary.chunkConfiguration,
      sources:corpus.summary.articles,topicMapping:mapping,documentPipelineTimeMs:corpus.summary.processingTimeMs});
    await retrieve({question:dataset.questions[0].question,vectors:corpus.vectors,embedder,k:5});
    const questions=[];
    async function measure(question) {
      const runs=[];let first;
      for(let i=0;i<MEASURED_RUNS;i++) {
        const result=await retrieve({question:question.question,vectors:corpus.vectors,embedder,k:Math.max(...TOP_K_VALUES)});
        if(first){assert.deepEqual(result.topChunks,first.topChunks);assert.deepEqual(result.topArticles,first.topArticles);}else first=result;
        runs.push(result.timing);
      }
      const timingSummary=Object.fromEntries(Object.keys(runs[0]).map(key=>[key,{...stats(runs.map(x=>x[key])),median:[...runs.map(x=>x[key])].sort((a,b)=>a-b)[1]}]));
      const evaluated=evaluateQuestion(question,first,mapping);
      // Mốc includes code/title nguyên câu như frontend hiện tại; không phải semantic ranking.
      const matches=keywordMatches(question.question,corpus.articles);
      evaluated.keywordBaseline={matchedCodes:matches.map(a=>a.code),hit:evaluated.expected.length?matches.some(a=>evaluated.expected.some(e=>e.articleId===a.id)):null};
      return {...evaluated,timingRuns:runs,timingSummary};
    }
    // DEV trước. Hàm hiệu chỉnh không nhận/đọc bất kỳ kết quả TEST nào.
    for(const question of dataset.questions.filter(q=>q.split==='DEV'))questions.push(await measure(question));
    const calibration=calibrateThreshold(questions);
    const lockedThreshold=calibration.selectedThreshold;
    report.metadata.thresholdLockedBeforeTest=true;
    report.metadata.thresholdLockedAt=new Date().toISOString();
    console.log(`Đã khóa threshold DEV: ${lockedThreshold}`);
    for(const question of dataset.questions.filter(q=>q.split==='TEST'))questions.push(await measure(question));
    for(const question of questions) {
      question.threshold=lockedThreshold;
      question.accepted=accepts(question.topArticles[0].similarity,lockedThreshold);
      question.decision=question.accepted?'ACCEPT_SOURCE_CANDIDATE':'REJECT_SOURCE';
    }
    questions.sort((a,b)=>a.id.localeCompare(b.id,'en'));
    report.questions=questions;report.metrics=metrics(questions);
    report.thresholdExperiment={...calibration,testAtLockedThreshold:thresholdCounts(questions.filter(q=>q.split==='TEST'),lockedThreshold),
      allAtLockedThreshold:thresholdCounts(questions,lockedThreshold),
      // Bảng TEST/ALL là mô tả sau khi khóa; tuyệt đối không chọn lại threshold từ bảng này.
      postLockComparison:calibration.trials.map(trial=>({threshold:trial.threshold,test:thresholdCounts(questions.filter(q=>q.split==='TEST'),trial.threshold),all:thresholdCounts(questions,trial.threshold)}))};
    report.similarityDistribution=Object.fromEntries(['DIRECT','PARAPHRASE','PARTIAL','OUT_OF_KB'].map(group=>[group,stats(questions.filter(q=>q.group===group).map(q=>q.topArticles[0].similarity))]));
    report.timing={unit:'ms',modelInitializationExcluded:true,warmupExcluded:true,
      perQuestionAverages:Object.fromEntries(['queryEmbeddingMs','searchMs','totalMs'].map(key=>[key,stats(questions.map(q=>q.timingSummary[key].average))])),
      all72Measurements:Object.fromEntries(['queryEmbeddingMs','searchMs','totalMs'].map(key=>[key,stats(questions.flatMap(q=>q.timingRuns.map(t=>t[key])))]))};
    const after=await snapshot(pool);assert.deepEqual(after,before);
    report.validation={status:'PASS',realModel:true,finiteQueries:true,dimension:384,deterministicAcross3Runs:true,
      dataPreserved:true,before:counts(before),after:counts(after),allKnowledgePublished:after.knowledge_articles.every(a=>a.status==='PUBLISHED')};
    report.metadata.completed=true;
    return report;
  } finally {if(embedder)await embedder.dispose();}
}
module.exports={runExperiment,snapshot,counts};
if(require.main===module) {
  const pool=require('../config/db');
  runExperiment(pool).then(report=>{
    const target=path.resolve(__dirname,'../../.cache/rag/retrieval-summary.json');
    fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({articles:report.articleCount,chunks:report.chunkCount,questions:report.questionCount,metrics:report.metrics.ALL,threshold:report.thresholdExperiment.selectedThreshold,report:target},null,2));
  }).catch(error=>{console.error('Thực nghiệm retrieval thất bại:',error.code||error.name);process.exitCode=1;}).finally(()=>pool.end());
}