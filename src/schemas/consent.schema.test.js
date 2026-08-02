import { describe, expect, it } from 'vitest'
import { consentV2Schema, convertLegacyPatientConsent, parseConsentRegister } from './consent.schema'

const input={patientId:'p',requestId:'request-1',consentType:'artificial_intelligence',legalBasis:{code:'consent',justification:'Aceite específico e informado.'},version:{number:1,title:'Termo de IA',hash:'a'.repeat(64)},acceptedMethod:'electronic_checkbox',acceptedEvidence:{summary:'Aceite na plataforma.',representativeName:null,representativeRelationship:null}}
describe('consent schema',()=>{
  it('valida aceite conhecido e tipo futuro namespaced',()=>{expect(parseConsentRegister(input).consentType).toBe('artificial_intelligence');expect(parseConsentRegister({...input,consentType:'custom:new_purpose'}).consentType).toBe('custom:new_purpose')})
  it('rejeita hash, versão e base legal inválidos',()=>{expect(()=>parseConsentRegister({...input,version:{...input.version,hash:'x'}})).toThrow();expect(()=>parseConsentRegister({...input,legalBasis:{code:'unknown',justification:'inválida'}})).toThrow()})
  it('exige revogação coerente',()=>{const base={schemaVersion:2,id:'c',patientId:'p',organizationId:'u',professionalId:'u',consentType:'image',legalBasis:input.legalBasis,version:input.version,title:input.version.title,hash:input.version.hash,acceptedAt:new Date(),acceptedBy:'u',acceptedMethod:'in_person',acceptedEvidence:input.acceptedEvidence,revoked:false,revokedAt:null,revokedReason:null,revokedBy:null,active:true,createdAt:new Date(),updatedAt:new Date()};expect(consentV2Schema.safeParse(base).success).toBe(true);expect(consentV2Schema.safeParse({...base,revoked:true}).success).toBe(false)})
  it('converte TCLE V1 somente para leitura',()=>expect(convertLegacyPatientConsent({id:'p',userId:'u',tcleAccepted:true,createdAt:new Date()})?.legacy).toBe(true))
})
