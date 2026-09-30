const express=require('express');
const authenticate=require('../middleware/authMiddleware');
const authorizeRoles=require('../middleware/roleMiddleware');
const {RagError,ensureNoSecrets}=require('../rag/generationSafety');
const {validateQuestion,createRagService}=require('../rag/generationService');
function createRagRouter(getService) {
  const router=express.Router();router.use(authenticate,authorizeRoles('EMPLOYEE','IT','ADMIN'));
  router.post('/ask',async(req,res)=>{
    try{
      if(!req.body||Object.keys(req.body).some(key=>key!=='question'))throw new RagError('INVALID_BODY',400,'Chỉ chấp nhận trường question.');
      const question=validateQuestion(req.body.question);
      const {response}=await getService().ask(question);ensureNoSecrets(response);res.json(response);
    }catch(error){
      // Không serialize hoặc log lỗi SDK: có thể chứa credential/request gốc.
      if(error instanceof RagError)return res.status(error.status).json({success:false,code:error.code,message:error.message});
      res.status(500).json({success:false,code:'RAG_ERROR',message:'Không thể xử lý câu hỏi lúc này.'});
    }
  });return router;
}
let service;
module.exports=createRagRouter(()=>{if(!service)service=createRagService(require('../config/db'));return service;});
module.exports.createRagRouter=createRagRouter;
