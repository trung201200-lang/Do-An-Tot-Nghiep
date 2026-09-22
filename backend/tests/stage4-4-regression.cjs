const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync,execSync}=require('node:child_process');
const pool=require('../src/config/db');
const root=path.resolve(__dirname,'../..');
const backups=new Map();
const report={testedAt:new Date().toISOString(),suites:[],seedIdempotency:false,dataPreserved:false};
async function snapshot(){const data={};for(const table of ['users','tickets','ticket_history','knowledge_articles'])[data[table]]=await pool.query(`SELECT * FROM ${table} ORDER BY id`);return data;}
async function main(){
  assert.notEqual(process.env.NODE_ENV,'production');
  const before=await snapshot();
  assert.deepEqual(Object.values(before).map(rows=>rows.length),[3,3,17,8]);
  for(const file of ['stage4-2-api-results.json','stage4-2-regression-results.json','stage2-browser-results.json','stage3-browser-results.json','stage3-ticket-demo.png']){
    const full=path.join(root,'docs',file);backups.set(full,fs.readFileSync(full));
  }
  for(const [script,resultFile] of [
    ['stage4-2-api.cjs','stage4-2-api-results.json'],
    ['stage4-2-regression.cjs','stage4-2-regression-results.json'],
    ['stage2-browser.cjs','stage2-browser-results.json'],
    ['stage3-browser.cjs','stage3-browser-results.json'],
  ]){
    try{
      execFileSync(process.execPath,[path.join(__dirname,script)],{cwd:path.join(root,'backend'),stdio:'inherit',timeout:180000});
      const result=JSON.parse(fs.readFileSync(path.join(root,'docs',resultFile),'utf8'));
      if(result.results)assert.ok(result.results.every(item=>item.status==='PASS'));
      if(result.suites){assert.equal(result.dataPreserved,true);assert.ok(result.suites.every(s=>s.results.every(item=>item.status==='PASS')));}
      report.suites.push({script,result});
    }finally{
      if(script==='stage3-browser.cjs'){
        const browserReport=JSON.parse(fs.readFileSync(path.join(root,'docs',resultFile),'utf8'));
        const created=browserReport.demoTicket;
        if(created&&!before.tickets.some(ticket=>ticket.id===created.id)){
          const [[ticket]]=await pool.execute('SELECT id,code,title FROM tickets WHERE id = ?',[created.id]);
          assert.equal(ticket.code,created.code);assert.equal(ticket.title,'Demo giao diện: Không kết nối được Wi-Fi văn phòng');
          const connection=await pool.getConnection();
          try{await connection.beginTransaction();await connection.execute('DELETE FROM ticket_history WHERE ticket_id = ?',[created.id]);await connection.execute('DELETE FROM tickets WHERE id = ? AND code = ?',[created.id,created.code]);await connection.commit();}
          catch(error){await connection.rollback();throw error;}finally{connection.release();}
        }
      }
    }
  }
  // Chỉ chạy seed ở trạng thái bình thường; không sửa bất kỳ bài demo nào.
  for(let i=0;i<2;i++)execSync('npm.cmd run seed:knowledge',{cwd:path.join(root,'backend'),stdio:'inherit',timeout:60000});
  const after=await snapshot();assert.deepEqual(after,before);
  assert.ok(after.knowledge_articles.every(article=>article.status==='PUBLISHED'));
  report.seedIdempotency=true;report.dataPreserved=true;
  report.counts=Object.fromEntries(Object.entries(after).map(([name,rows])=>[name,rows.length]));
  console.log('PASS: hồi quy API/browser, seed hai lần và dữ liệu gốc nguyên vẹn.');
}
main().catch(error=>{console.error('Regression failed',error.code||error.name);process.exitCode=1;}).finally(async()=>{
  for(const [file,content]of backups)fs.writeFileSync(file,content);
  fs.writeFileSync(path.join(root,'docs/stage4-4-regression-results.json'),JSON.stringify(report,null,2)+'\n');
  await pool.end();
});
