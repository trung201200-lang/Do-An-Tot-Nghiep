const {createHash}=require('node:crypto');
const {normalizeText}=require('./text');
const config=require('./generationConfig');
const {RagError,ensureNoSecrets}=require('./generationSafety');
const sourceHash=a=>createHash('sha256').update(JSON.stringify([a.id,a.code,a.title,a.content,a.status])).digest('hex');
function selectContext(ranking, articles) {
  const result=[];let length=0;
  for(const hit of ranking.slice(0,config.TOP_K)) {
    if(hit.similarity<config.THRESHOLD)continue;
    const article=articles.find(a=>a.id===hit.articleId);
    if(!article||article.status!=='PUBLISHED'||article.code!==hit.code||article.title!==hit.title)throw new RagError('STALE_SOURCE',503,'Nguồn tri thức đã thay đổi; vui lòng thử lại.');
    if(result.some(a=>a.articleId===article.id))continue;
    const text=normalizeText(article.content);
    if(length+Array.from(text).length>config.MAX_CONTEXT_CHARACTERS)continue;
    const selected={articleId:article.id,code:article.code,title:article.title,score:hit.similarity,text,sourceHash:sourceHash(article)};
    ensureNoSecrets(selected);result.push(selected);length+=Array.from(text).length;
  }
  return result;
}
async function verifySources(pool, context) {
  if(!context.length)return;
  const ids=context.map(a=>a.articleId);
  const [rows]=await pool.execute(`SELECT id, code, title, content, status FROM knowledge_articles WHERE status = ? AND id IN (${ids.map(()=>'?').join(',')})`,['PUBLISHED',...ids]);
  if(context.some(source=>!rows.some(row=>row.id===source.articleId&&sourceHash(row)===source.sourceHash)))throw new RagError('STALE_SOURCE',503,'Nguồn tri thức đã thay đổi; vui lòng thử lại.');
}
module.exports={sourceHash,selectContext,verifySources};
