const {GoogleGenAI}=require('@google/genai');
const config=require('./generationConfig');
const {RESPONSE_SCHEMA}=require('./generationPrompt');
const {RagError,providerError}=require('./generationSafety');
function createGeminiClient({clientFactory=options=>new GoogleGenAI(options)}={}) {
  const key=process.env.GEMINI_API_KEY?.trim();
  if(!key)throw new RagError('GEMINI_KEY_MISSING',503,'Chưa cấu hình Gemini trên backend.');
  const model=process.env.GEMINI_MODEL?.trim()||config.MODEL;
  if(model!==config.MODEL)throw new RagError('GEMINI_MODEL_CONFIGURATION',503,'Model cấu hình khác model đã được phê duyệt.');
  const client=clientFactory({apiKey:key,httpOptions:{timeout:config.TIMEOUT_MS,retryOptions:{attempts:1}}});
  return {async generate(prompt){
    let response;
    try{response=await client.models.generateContent({model,contents:prompt.contents,config:{systemInstruction:prompt.systemInstruction,responseMimeType:'application/json',responseJsonSchema:RESPONSE_SCHEMA,maxOutputTokens:config.MAX_OUTPUT_TOKENS,httpOptions:{timeout:config.TIMEOUT_MS,retryOptions:{attempts:1}}}});}catch(error){throw providerError(error);}
    const candidate=response?.candidates?.[0];
    if(candidate?.finishReason&&candidate.finishReason!=='STOP')throw new RagError('GEMINI_INCOMPLETE',502,'Gemini không hoàn tất phản hồi hợp lệ.');
    const text=candidate?.content?.parts?.filter(p=>!p.thought&&typeof p.text==='string').map(p=>p.text).join('')||'';
    if(!text.trim())throw new RagError('GEMINI_EMPTY',502,'Gemini trả phản hồi rỗng.');
    return {text,usage:{inputTokens:response.usageMetadata?.promptTokenCount??null,outputTokens:response.usageMetadata?.candidatesTokenCount??null,totalTokens:response.usageMetadata?.totalTokenCount??null}};
  }};
}
module.exports={createGeminiClient};
