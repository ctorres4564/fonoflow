import { collection, getDocs, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../firebase/config'
import { convertLegacyPatientConsent, normalizeConsentDocument } from '../schemas/consent.schema'

async function request(path, payload) {
  const token=await auth.currentUser?.getIdToken();if(!token)throw new Error('Usuário não autenticado.')
  const response=await fetch(path,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(payload)})
  const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error?.message||'Não foi possível processar o consentimento.');return data
}
const byVersion=(a,b)=>Number(b.version?.number||0)-Number(a.version?.number||0)

export function subscribeConsents(patient, callback, onError) {
  const legacy=convertLegacyPatientConsent(patient)
  return onSnapshot(collection(db,'patients',patient.id,'consents'),(snapshot)=>{
    const records=snapshot.docs.map((item)=>normalizeConsentDocument({id:item.id,...item.data()})).sort(byVersion)
    callback(legacy&&records.every((item)=>item.consentType!=='clinical_care')?[...records,legacy]:records)
  },onError)
}

export async function listConsentHistory(patient) {
  const snapshot=await getDocs(collection(db,'patients',patient.id,'consents'));const records=snapshot.docs.map((item)=>normalizeConsentDocument({id:item.id,...item.data()})).sort(byVersion);const legacy=convertLegacyPatientConsent(patient);return legacy&&records.every((item)=>item.consentType!=='clinical_care')?[...records,legacy]:records
}

export const registerConsent=(payload)=>request('/api/consents/register',{...payload,requestId:payload.requestId||crypto.randomUUID()})
export const revokeConsent=(payload)=>request('/api/consents/revoke',{...payload,requestId:payload.requestId||crypto.randomUUID()})
export const validateConsent=(patientId,consentType)=>request('/api/consents/validate',{patientId,consentType,requestId:crypto.randomUUID()})
export const hasValidConsent=async(patientId,consentType)=>(await validateConsent(patientId,consentType)).valid===true

export const consentService={registerConsent,revokeConsent,validateConsent,hasValidConsent,listConsentHistory,subscribeConsents}
