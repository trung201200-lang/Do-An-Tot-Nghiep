const {performance}=require('node:perf_hooks');
const {createHash}=require('node:crypto');
const config=require('./generationConfig');
const {MAX_TOKENS}=require('./config');
const {normalizeText}=require('./text');
const {readPublished,runPipeline}=require('./pipeline');
const {loadEmbedder}=require('./embedding');
const {retrieve,queryText}=require('./retrieval');
const {selectContext,verifySources}=require('./generationContext');
const {buildPrompt}=require('./generationPrompt');
const {createGeminiClient}=require('./geminiClient');
const {fallback,normalizeOutput}=require('./generationOutput');
const {RagError,ensureNoSecrets}=require('./generationSafety');
function validateQuestion(question) {
  if(typeof question!=='string'||!question.trim()||Array.from(question).length>config.MAX_QUESTION_CHARACTERS)throw new RagError('INVALID_QUESTION',400,'Câu hỏi phải có từ 1 đến 1000 ký tự.');
  const result=normalizeText(question);ensureNoSecrets(result);return result;
}
async function answerQuestion({question,corpus,embedder,generate,verify=async()=>{}}) {
  const started=performance.now();question=validateQuestion(question);
  if(embedder.countTokens(queryText(question))>MAX_TOKENS)throw new RagError('QUESTION_TOO_LONG',400,'Câu hỏi vượt giới hạn token; vui lòng rút gọn.');
  const retrieval=await retrieve({question,vectors:corpus.vectors,embedder,k:config.TOP_K,threshold:config.THRESHOLD});
  const timing={queryEmbeddingMs:retrieval.timing.queryEmbeddingMs,retrievalMs:retrieval.timing.searchMs,contextMs:0,generationMs:0,totalMs:0};
  const trace={retrieval:retrieval.topArticles,context:[],geminiCalled:false,reason:'BELOW_THRESHOLD',timing};
  if(!retrieval.accepted){timing.totalMs=performance.now()-started;return {response:fallback(),trace};}
  const contextStart=performance.now();const context=selectContext(retrieval.topArticles,corpus.articles);await verify(context);
  trace.context=context;timing.contextMs=performance.now()-contextStart;
  if(!context.length){trace.reason='NO_CONTEXT';timing.totalMs=performance.now()-started;return {response:fallback(),trace};}
  const prompt=buildPrompt(question,context);ensureNoSecrets(prompt);
  const generateStart=performance.now();trace.geminiCalled=true;
  const generated=await generate(prompt);timing.generationMs=performance.now()-generateStart;
  let normalized;
  try { normalized=normalizeOutput(generated.text,context); }
  catch(error) {
    if(['GEMINI_INVALID_OUTPUT','GEMINI_INVALID_EVIDENCE'].includes(error.code)) {
      ensureNoSecrets(generated.text);
      timing.totalMs=performance.now()-started;
      // Chỉ runner thực nghiệm đọc diagnostic; HTTP route chỉ trả code/message cố định.
      error.experimentDiagnostic={...trace,rawGeneration:generated.text,usage:generated.usage,reason:error.code};
    }
    throw error;
  }
  await verify(context);
  Object.assign(trace,{reason:normalized.reason,evidence:normalized.evidence,usage:generated.usage});
  timing.totalMs=performance.now()-started;return {response:normalized.response,trace};
}
function createRagService(pool) {
  let embedderPromise,corpus,indexKey,client,busy=false;
  async function prepare(){
    if(!embedderPromise)embedderPromise=loadEmbedder().catch(error=>{embedderPromise=null;throw error;});
    const embedder=await embedderPromise;
    const rows=await readPublished(pool);const key=createHash('sha256').update(JSON.stringify(rows)).digest('hex');
    if(key!==indexKey){corpus=rows.length?await runPipeline(pool,embedder):{articles:[],vectors:[]};indexKey=key;}
    return {embedder,corpus};
  }
  return {prepare,async ask(question){
    validateQuestion(question);
    if(busy)throw new RagError('RAG_BUSY',429,'Hệ thống đang xử lý câu hỏi khác; vui lòng thử lại.');
    busy=true;
    try{const start=performance.now();const prepared=await prepare();const preparationMs=performance.now()-start;
      const result=await answerQuestion({question,...prepared,verify:context=>verifySources(pool,context),generate:async prompt=>{if(!client)client=createGeminiClient();return client.generate(prompt);}});
      result.trace.preparationMs=preparationMs;return result;
    }finally{busy=false;}
  },async dispose(){if(embedderPromise)await(await embedderPromise).dispose();}};
}
module.exports={validateQuestion,answerQuestion,createRagService};
