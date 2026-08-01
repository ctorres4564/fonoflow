import { consentV2Schema, parseConsentRegister, parseConsentRevoke, parseConsentValidate } from '../../src/schemas/consent.schema.js'

const assertOwner=(patient,uid)=>{if(!patient||patient.userId!==uid){const error=new Error('forbidden');error.code='FORBIDDEN';throw error}}

export async function registerConsent({ uid, payload, repository }) {
  const input=parseConsentRegister(payload);const consentId=repository.createId(`patients/${input.patientId}/consents`);const operationPath=`consentOperations/${input.requestId}`;const timestamp=repository.timestamp()
  return repository.runTransaction(async(transaction)=>{
    const [patient,operation]=await transaction.readMany([`patients/${input.patientId}`,operationPath]);assertOwner(patient,uid)
    if(operation){if(operation.operation!=='register'||operation.patientId!==input.patientId)throw Object.assign(new Error('idempotency_conflict'),{code:'CONFLICT'});return {consentId:operation.consentId,replayed:true}}
    const organizationId=patient.organizationId||uid
    const consent=consentV2Schema.parse({schemaVersion:2,patientId:input.patientId,organizationId,professionalId:uid,consentType:input.consentType,legalBasis:input.legalBasis,version:input.version,title:input.version.title,hash:input.version.hash.toLowerCase(),acceptedAt:timestamp,acceptedBy:uid,acceptedMethod:input.acceptedMethod,acceptedEvidence:input.acceptedEvidence,revoked:false,revokedAt:null,revokedReason:null,revokedBy:null,active:true,createdAt:timestamp,updatedAt:timestamp})
    transaction.create(`patients/${input.patientId}/consents/${consentId}`,consent)
    transaction.create(`auditLogs/${repository.createId('auditLogs')}`,{schemaVersion:1,actorId:uid,action:'consent.registered',patientId:input.patientId,resourceId:consentId,requestId:input.requestId,changedFields:['consentType','version','acceptedAt'],occurredAt:timestamp,source:'backend'})
    transaction.create(operationPath,{operation:'register',patientId:input.patientId,consentId,uid,createdAt:timestamp})
    return {consentId,replayed:false}
  })
}

export async function revokeConsent({ uid, payload, repository }) {
  const input=parseConsentRevoke(payload);const operationPath=`consentOperations/${input.requestId}`;const consentPath=`patients/${input.patientId}/consents/${input.consentId}`;const timestamp=repository.timestamp()
  return repository.runTransaction(async(transaction)=>{
    const [patient,consent,operation]=await transaction.readMany([`patients/${input.patientId}`,consentPath,operationPath]);assertOwner(patient,uid)
    if(operation){if(operation.operation!=='revoke'||operation.consentId!==input.consentId)throw Object.assign(new Error('idempotency_conflict'),{code:'CONFLICT'});return {consentId:input.consentId,replayed:true}}
    if(!consent)throw Object.assign(new Error('not_found'),{code:'NOT_FOUND'});if(consent.patientId!==input.patientId)throw Object.assign(new Error('forbidden'),{code:'FORBIDDEN'});if(consent.revoked)throw Object.assign(new Error('already_revoked'),{code:'CONFLICT'})
    transaction.update(consentPath,{revoked:true,revokedAt:timestamp,revokedReason:input.reason,revokedBy:uid,active:false,updatedAt:timestamp})
    transaction.create(`auditLogs/${repository.createId('auditLogs')}`,{schemaVersion:1,actorId:uid,action:'consent.revoked',patientId:input.patientId,resourceId:input.consentId,requestId:input.requestId,changedFields:['revoked','revokedAt','revokedReason','active'],occurredAt:timestamp,source:'backend'})
    transaction.create(operationPath,{operation:'revoke',patientId:input.patientId,consentId:input.consentId,uid,createdAt:timestamp})
    return {consentId:input.consentId,replayed:false}
  })
}

export async function validateConsent({ uid, payload, repository }) {
  const input=parseConsentValidate(payload);const patient=await repository.read(`patients/${input.patientId}`);assertOwner(patient,uid)
  const consents=(await repository.list(input.patientId)).filter((item)=>item.consentType===input.consentType&&item.active&&!item.revoked)
  consents.sort((a,b)=>Number(b.version?.number||0)-Number(a.version?.number||0))
  const current=consents[0]||null
  await repository.recordAudit({schemaVersion:1,actorId:uid,action:'consent.validated',patientId:input.patientId,resourceId:current?.id||'',requestId:input.requestId,changedFields:['consentType'],source:'backend'})
  return {valid:Boolean(current),consentId:current?.id||null,version:current?.version||null,legalBasis:current?.legalBasis||null}
}
