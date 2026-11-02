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
const {buildOllamaPrompt}=require('./ollamaPrompt');
const {createGenerationProvider,validateProvider}=require('./generationProvider');
const {fallback,normalizeOutput}=require('./generationOutput');
const {RagError,ensureNoSecrets}=require('./generationSafety');
const {setDiagnosticStage,setDiagnosticProvider,markProviderCalled}=require('./ragDiagnostics');
function validateQuestion(question) {
  if(typeof question!=='string'||!question.trim()||Array.from(question).length>config.MAX_QUESTION_CHARACTERS)throw new RagError('INVALID_QUESTION',400,'Câu hỏi phải có từ 1 đến 1000 ký tự.');
  const result=normalizeText(question);ensureNoSecrets(result);return result;
}
async function answerQuestion({question,corpus,embedder,generate,providerName='gemini',providerModel=config.MODEL,verify=async()=>{}}) {
  setDiagnosticProvider(providerName);setDiagnosticStage('question_validation');
  const started=performance.now();question=validateQuestion(question);
  setDiagnosticStage('question_tokenization');
  if(embedder.countTokens(queryText(question))>MAX_TOKENS)throw new RagError('QUESTION_TOO_LONG',400,'Câu hỏi vượt giới hạn token; vui lòng rút gọn.');
  setDiagnosticStage('retrieval');
  const retrieval=await retrieve({question,vectors:corpus.vectors,embedder,k:config.TOP_K,threshold:config.THRESHOLD});
  const timing={queryEmbeddingMs:retrieval.timing.queryEmbeddingMs,retrievalMs:retrieval.timing.searchMs,contextMs:0,generationMs:0,totalMs:0};
  const trace={retrieval:retrieval.topArticles,context:[],provider:providerName,model:providerModel,providerCalled:false,geminiCalled:false,reason:'BELOW_THRESHOLD',timing};
  if(!retrieval.accepted){timing.totalMs=performance.now()-started;return {response:fallback(),trace};}
  setDiagnosticStage('context_selection');
  const contextStart=performance.now();const context=selectContext(retrieval.topArticles,corpus.articles);
  setDiagnosticStage('source_verify_before');await verify(context);
  trace.context=context;timing.contextMs=performance.now()-contextStart;
  if(!context.length){trace.reason='NO_CONTEXT';timing.totalMs=performance.now()-started;return {response:fallback(),trace};}
  setDiagnosticStage('prompt_build');
  const prompt=(providerName==='ollama'?buildOllamaPrompt:buildPrompt)(question,context);ensureNoSecrets(prompt);
  const generateStart=performance.now();trace.providerCalled=true;trace.geminiCalled=providerName==='gemini';
  setDiagnosticStage('provider_generate');markProviderCalled();
  const generated=await generate(prompt);timing.generationMs=performance.now()-generateStart;
  setDiagnosticStage('output_validation');
  let normalized;
  try { normalized=normalizeOutput(generated.text,context); }
  catch(error) {
    if(['GEMINI_INVALID_OUTPUT','GEMINI_INVALID_EVIDENCE'].includes(error.code)) {
      if(providerName==='ollama') {
        throw new RagError(error.code.replace('GEMINI_', 'OLLAMA_'), error.status,
          'Không xác minh được nội dung hoặc căn cứ của câu trả lời Ollama.');
      }
      ensureNoSecrets(generated.text);
      timing.totalMs=performance.now()-started;
      // Chỉ runner thực nghiệm đọc diagnostic; HTTP route chỉ trả code/message cố định.
      error.experimentDiagnostic={...trace,rawGeneration:generated.text,usage:generated.usage,reason:error.code};
    }
    throw error;
  }
  setDiagnosticStage('source_verify_after');await verify(context);
  setDiagnosticStage('response_prepare');
  Object.assign(trace,{reason:normalized.reason,evidence:normalized.evidence,usage:generated.usage});
  timing.totalMs=performance.now()-started;return {response:normalized.response,trace};
}
// Injection is an internal JS API, not a public request option. loadEmbedding
// permits in-memory service tests without downloading a model or using MySQL.
function createRagService(pool,{provider,loadEmbedding=loadEmbedder}={}) {
  setDiagnosticStage('provider_selection');
  const selectedProvider=validateProvider(provider===undefined?createGenerationProvider():provider);
  setDiagnosticProvider(selectedProvider.name);
  let embedderPromise,corpus,indexKey,busy=false;
  async function prepare(){
    setDiagnosticStage('embedding_load');
    if(!embedderPromise)embedderPromise=loadEmbedding().catch(error=>{embedderPromise=null;throw error;});
    const embedder=await embedderPromise;
    setDiagnosticStage('kb_read');
    const rows=await readPublished(pool);
    setDiagnosticStage('index_snapshot');const key=createHash('sha256').update(JSON.stringify(rows)).digest('hex');
    if(key!==indexKey){corpus=rows.length?await runPipeline(pool,embedder):{articles:[],vectors:[]};indexKey=key;}
    return {embedder,corpus};
  }
  return {prepare,async ask(question){
    setDiagnosticProvider(selectedProvider.name);setDiagnosticStage('question_validation');
    validateQuestion(question);
    if(busy)throw new RagError('RAG_BUSY',429,'Hệ thống đang xử lý câu hỏi khác; vui lòng thử lại.');
    busy=true;
    try{const start=performance.now();const prepared=await prepare();const preparationMs=performance.now()-start;
      const result=await answerQuestion({question,...prepared,providerName:selectedProvider.name,providerModel:selectedProvider.model,verify:context=>verifySources(pool,context),generate:prompt=>selectedProvider.generate(prompt)});
      result.trace.preparationMs=preparationMs;return result;
    }finally{busy=false;}
  },async dispose(){if(embedderPromise)await(await embedderPromise).dispose();}};
}
module.exports={validateQuestion,answerQuestion,createRagService};
