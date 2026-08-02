import { cert,getApps,initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue,getFirestore } from 'firebase-admin/firestore'
import { parseAuditBody,parseAuditQuery } from './_lib/auditValidation.js'

function cors(request,response){const origin=request.headers.origin;const allowed=origin==='https://fonoflow.vercel.app'||/^http:\/\/localhost(:\d+)?$/.test(origin||'');response.setHeader('Access-Control-Allow-Origin',allowed?origin:'https://fonoflow.vercel.app');response.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');response.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type')}
function adminApp(){if(getApps().length)return getApps()[0];const projectId=process.env.FIREBASE_ADMIN_PROJECT_ID;const clientEmail=process.env.FIREBASE_ADMIN_CLIENT_EMAIL;const privateKey=process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g,'\n');if(!projectId||!clientEmail||!privateKey)throw new Error('Firebase Admin credentials are not configured');return initializeApp({credential:cert({projectId,clientEmail,privateKey})})}
async function actor(request){const match=request.headers.authorization?.match(/^Bearer\s+(\S+)$/);if(!match)return null;return getAuth(adminApp()).verifyIdToken(match[1])}
async function ownsPatient(db,uid,patientId){const snapshot=await db.collection('patients').doc(patientId).get();return snapshot.exists&&snapshot.data()?.userId===uid}
const failure=(response,status,code,message)=>response.status(status).json({error:{code,message}})

export default async function handler(request,response){
  cors(request,response);if(request.method==='OPTIONS')return response.status(200).end();if(!['GET','POST'].includes(request.method))return failure(response,405,'METHOD_NOT_ALLOWED','MÃ©todo nÃ£o permitido.')
  let decoded;try{decoded=await actor(request)}catch(error){console.error('Audit authentication failed:',error?.code||error?.name||'authentication_error')}
  if(!decoded?.uid)return failure(response,401,'UNAUTHENTICATED','SessÃ£o invÃ¡lida ou expirada.')
  const db=getFirestore(adminApp())
  if(request.method==='GET'){
    let limit;try{limit=parseAuditQuery(request.query).limit}catch{return failure(response,400,'INVALID_QUERY','ParÃ¢metros de consulta invÃ¡lidos.')}
    const snapshot=await db.collection('auditLogs').where('actorId','==',decoded.uid).limit(limit).get();const events=snapshot.docs.map((item)=>({id:item.id,...item.data(),occurredAt:item.data().occurredAt?.toDate?.().toISOString()||null})).sort((a,b)=>String(b.occurredAt).localeCompare(String(a.occurredAt)));return response.status(200).json({events})
  }
  let payload;try{payload=parseAuditBody(request.body)}catch(error){const tooLarge=error?.message==='PAYLOAD_TOO_LARGE';return failure(response,tooLarge?413:400,tooLarge?'PAYLOAD_TOO_LARGE':'INVALID_PAYLOAD',tooLarge?'Corpo da requisiÃ§Ã£o excede o limite.':'Payload de auditoria invÃ¡lido.')}
  if(!(await ownsPatient(db,decoded.uid,payload.patientId)))return failure(response,403,'FORBIDDEN','Acesso ao prontuÃ¡rio nÃ£o autorizado.')
  const event={actorId:decoded.uid,actorEmail:typeof decoded.email==='string'?decoded.email.slice(0,200):'',action:payload.action,patientId:payload.patientId,resourceId:payload.resourceId||'',changedFields:payload.changedFields,occurredAt:FieldValue.serverTimestamp(),source:'web',schemaVersion:1}
  const ref=await db.collection('auditLogs').add(event);return response.status(201).json({id:ref.id})
}
