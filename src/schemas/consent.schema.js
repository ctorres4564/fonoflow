import { z } from 'zod'

export const CONSENT_TYPES = Object.freeze([
  'clinical_care', 'electronic_health_record', 'privacy_policy', 'communication',
  'document_delivery', 'image', 'video', 'audio', 'telehealth', 'artificial_intelligence',
  'research', 'authorized_sharing',
])
export const LEGAL_BASES = Object.freeze([
  'consent', 'contract_performance', 'legal_obligation', 'health_protection',
  'life_protection', 'legitimate_interest', 'regular_exercise_of_rights',
])
export const ACCEPTED_METHODS = Object.freeze(['in_person', 'verbal', 'electronic_checkbox', 'imported_record'])

const id = z.string().trim().min(1).max(128).regex(/^[^/.][^/]*$/)
const timestamp = z.unknown().refine((value) => value != null, 'Timestamp obrigatório')
const consentType = z.string().trim().min(1).max(80).refine((value) => CONSENT_TYPES.includes(value) || /^custom:[a-z0-9_-]{2,60}$/.test(value), 'Tipo de consentimento inválido')

export const legalBasisSchema = z.object({ code: z.enum(LEGAL_BASES), justification: z.string().trim().min(5).max(1000) }).strict()
export const consentVersionSchema = z.object({ number: z.number().int().positive(), title: z.string().trim().min(3).max(300), hash: z.string().regex(/^[a-f0-9]{64}$/i, 'Hash SHA-256 inválido') }).strict()
export const consentEvidenceSchema = z.object({ summary: z.string().trim().max(1000).nullable(), representativeName: z.string().trim().max(200).nullable(), representativeRelationship: z.string().trim().max(100).nullable() }).strict()
export const consentRevocationSchema = z.object({ revokedAt: timestamp, revokedBy: id, reason: z.string().trim().min(5).max(1000), requestId: id }).strict()
export const consentAuditSchema = z.object({ actorId: id, operation: z.enum(['registered', 'revoked', 'validated']), requestId: id, consentId: id, occurredAt: timestamp }).strict()

export const consentV2Schema = z.object({
  schemaVersion: z.literal(2), id: id.optional(), patientId: id, organizationId: id,
  professionalId: id, consentType, legalBasis: legalBasisSchema, version: consentVersionSchema,
  title: z.string().trim().min(3).max(300), hash: z.string().regex(/^[a-f0-9]{64}$/i),
  acceptedAt: timestamp, acceptedBy: id, acceptedMethod: z.enum(ACCEPTED_METHODS),
  acceptedEvidence: consentEvidenceSchema, revoked: z.boolean(), revokedAt: z.unknown().nullable(),
  revokedReason: z.string().trim().max(1000).nullable(), revokedBy: z.string().trim().max(128).nullable().optional(),
  active: z.boolean(), createdAt: timestamp, updatedAt: timestamp,
}).strict().superRefine((value, context) => {
  if (value.title !== value.version.title || value.hash.toLowerCase() !== value.version.hash.toLowerCase()) context.addIssue({ code: 'custom', path: ['version'], message: 'Título e hash devem corresponder à versão aceita.' })
  if (value.revoked && (!value.revokedAt || !value.revokedReason || !value.revokedBy || value.active)) context.addIssue({ code: 'custom', path: ['revoked'], message: 'Revogação incompleta.' })
  if (!value.revoked && (value.revokedAt || value.revokedReason || value.revokedBy || !value.active)) context.addIssue({ code: 'custom', path: ['active'], message: 'Consentimento ativo inconsistente.' })
})

export const consentRegisterInputSchema = z.object({ patientId: id, requestId: id, consentType, legalBasis: legalBasisSchema, version: consentVersionSchema, acceptedMethod: z.enum(ACCEPTED_METHODS), acceptedEvidence: consentEvidenceSchema }).strict()
export const consentRevokeInputSchema = z.object({ patientId: id, consentId: id, requestId: id, reason: z.string().trim().min(5).max(1000) }).strict()
export const consentValidateInputSchema = z.object({ patientId: id, consentType, requestId: id }).strict()

export const parseConsentRegister = (value) => consentRegisterInputSchema.parse(value)
export const parseConsentRevoke = (value) => consentRevokeInputSchema.parse(value)
export const parseConsentValidate = (value) => consentValidateInputSchema.parse(value)

export function normalizeConsentDocument(raw) {
  if (raw?.schemaVersion === 2) return consentV2Schema.parse(raw)
  throw new Error(`Versão de consentimento não suportada: ${raw?.schemaVersion ?? 'ausente'}`)
}

export function convertLegacyPatientConsent(patient) {
  if (!patient?.tcleAccepted) return null
  const acceptedAt = patient.tcleAcceptedAt || patient.updatedAt || patient.createdAt || new Date(0)
  const legacyHash = '0'.repeat(64)
  return { schemaVersion:2,id:'legacy-tcle',patientId:patient.id,organizationId:patient.organizationId||patient.userId,professionalId:patient.userId,consentType:'clinical_care',legalBasis:{code:'consent',justification:'Registro legado de TCLE migrado apenas para leitura.'},version:{number:1,title:'TCLE legado',hash:legacyHash},title:'TCLE legado',hash:legacyHash,acceptedAt,acceptedBy:patient.userId,acceptedMethod:'imported_record',acceptedEvidence:{summary:'Importado do cadastro V1.',representativeName:null,representativeRelationship:null},revoked:false,revokedAt:null,revokedReason:null,revokedBy:null,active:true,createdAt:acceptedAt,updatedAt:acceptedAt,legacy:true }
}
