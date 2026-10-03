const config=require('./generationConfig');
const {normalizeText}=require('./text');
const {RagError,ensureNoSecrets}=require('./generationSafety');
const fallback=()=>({answered:false,answer:config.FALLBACK,sources:[]});
function normalizeOutput(raw,context) {
  ensureNoSecrets(raw);
  let output;
  try{output=JSON.parse(raw);}catch{throw new RagError('GEMINI_INVALID_OUTPUT',502,'Gemini trả dữ liệu không hợp lệ.');}
  if(!output||typeof output!=='object'||Array.isArray(output)||Object.keys(output).some(k=>!['answered','answer','evidence'].includes(k))||typeof output.answered!=='boolean'||typeof output.answer!=='string'||!output.answer.trim()||output.answer.length>8000||!Array.isArray(output.evidence)||output.evidence.length>8)throw new RagError('GEMINI_INVALID_OUTPUT',502,'Gemini trả dữ liệu không hợp lệ.');
  if(!output.answered)return {response:fallback(),evidence:[],reason:'INSUFFICIENT_CONTEXT'};
  if(!output.evidence.length||/KB-\d+/i.test(output.answer))throw new RagError('GEMINI_INVALID_EVIDENCE',502,'Không xác minh được căn cứ của phản hồi.');
  const selected=new Set();const evidence=[];
  for(const value of output.evidence){
    if(typeof value!=='string'||value.trim().length<20)throw new RagError('GEMINI_INVALID_EVIDENCE',502,'Không xác minh được căn cứ của phản hồi.');
    const quote=normalizeText(value);const matches=context.filter(source=>source.text.includes(quote));
    if(quote.length<20||!matches.length)throw new RagError('GEMINI_INVALID_EVIDENCE',502,'Không xác minh được căn cứ của phản hồi.');
    // Kiểm tra TOÀN BỘ quote trước khi rút gọn; suffix bịa vẫn bị từ chối.
    // 500 giới hạn excerpt nội bộ, không làm mất câu trả lời có trích dẫn hợp lệ.
    let excerpt=quote.slice(0,500);
    if(/[\uD800-\uDBFF]$/.test(excerpt))excerpt=excerpt.slice(0,-1);
    matches.forEach(source=>selected.add(source.articleId));evidence.push({quote:excerpt,codes:matches.map(source=>source.code)});
  }
  // Code/title/score chỉ lấy từ context Retrieval đã xác minh, không nhận từ model.
  const sources=context.filter(source=>selected.has(source.articleId)).map(({code,title,score})=>({code,title,score}));
  const response={answered:true,answer:output.answer.trim(),sources};ensureNoSecrets(response);
  return {response,evidence,reason:'GENERATED'};
}
module.exports={fallback,normalizeOutput};
