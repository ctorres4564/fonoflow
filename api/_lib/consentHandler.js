const origins=new Set(['https://fonoflow.vercel.app','http://localhost:3000','http://localhost:4173','http://localhost:5173'])
const token=(header)=>typeof header==='string'?header.match(/^Bearer\s+(\S+)$/)?.[1]:null
const statusFor=(error)=>({FORBIDDEN:403,NOT_FOUND:404,CONFLICT:409}[error?.code]||400)

export function createConsentHandler({ authenticate, repository, operation, successStatus = 201 }) {
  return async(request,response)=>{
    const origin=request.headers?.origin;const allowed=!origin||origins.has(origin);response.setHeader('Vary','Origin');response.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');response.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');if(origin&&allowed)response.setHeader('Access-Control-Allow-Origin',origin)
    if(request.method==='OPTIONS')return response.status(allowed?204:403).end();if(!allowed)return response.status(403).json({error:{code:'FORBIDDEN',message:'Origem não autorizada.'}});if(request.method!=='POST')return response.status(405).json({error:{code:'METHOD_NOT_ALLOWED',message:'Método não permitido.'}})
    try{const bearer=token(request.headers?.authorization);if(!bearer)return response.status(401).json({error:{code:'UNAUTHENTICATED',message:'Sessão inválida.'}});const identity=await authenticate(bearer);const result=await operation({uid:identity.uid,payload:request.body,repository});return response.status(result.replayed?200:successStatus).json(result)}catch(error){const status=error?.message==='unauthenticated'?401:statusFor(error);if(status===400&&error?.name!=='ZodError')console.error('Consent operation failed:',error?.code||error?.name);return response.status(status).json({error:{code:error?.code||'INVALID_REQUEST',message:status===400?'Dados de consentimento inválidos.':error.message}})}
  }
}
