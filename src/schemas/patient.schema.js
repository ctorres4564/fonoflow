import { z } from 'zod'
import { isoDateSchema, nonEmptyTextArray, nullableText, timestampSchema } from './common.schema.js'

export const CURRENT_PATIENT_SCHEMA_VERSION = 2
const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']
const optionalEmail = z.union([z.literal(''), z.string().email()]).nullable().optional()
const addressSchema = z.object({ postalCode: nullableText(12), street: nullableText(200), number: nullableText(30), complement: nullableText(100), district: nullableText(100), city: nullableText(100), state: z.union([z.literal(''), z.enum(UFS)]).nullable().optional(), referencePoint: nullableText(300) })

function validCpf(value) {
  const cpf = String(value || '').replace(/\D/g, '')
  if (!cpf) return true
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false
  const digit = (length) => { let sum = 0; for (let i = 0; i < length; i += 1) sum += Number(cpf[i]) * (length + 1 - i); const result = (sum * 10) % 11; return result === 10 ? 0 : result }
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10])
}

export const patientV2Schema = z.object({
  schemaVersion: z.literal(2), id: z.string().optional(), userId: z.string().min(1).max(128), organizationId: z.string().nullable().optional(),
  personalData: z.object({ fullName: z.string().trim().min(1).max(200), socialName: nullableText(200), birthDate: isoDateSchema.nullable().optional(), cpf: nullableText(20).refine(validCpf, 'CPF inválido'), cns: nullableText(20), sex: nullableText(50), genderIdentity: nullableText(100) }),
  contact: z.object({ phone: nullableText(30), secondaryPhone: nullableText(30), email: optionalEmail }), address: addressSchema,
  legalRepresentative: z.object({ name: nullableText(200), cpf: nullableText(20).refine(validCpf, 'CPF inválido'), relationship: nullableText(100), phone: nullableText(30), email: optionalEmail }).optional(),
  emergencyContact: z.object({ name: nullableText(200), relationship: nullableText(100), phone: nullableText(30) }).optional(),
  clinicalProfile: z.object({ diagnosis: nullableText(2000), diagnosticHypothesis: nullableText(2000), cidCodes: nonEmptyTextArray(), cifCodes: nonEmptyTextArray(), referralSource: nullableText(300), mainComplaint: nullableText(4000), generalObservations: nullableText(8000) }),
  clinicalAlerts: z.object({ allergies: nonEmptyTextArray(), medications: nonEmptyTextArray(), aspirationRisk: z.boolean().optional(), tracheostomy: z.boolean().optional(), gastrostomy: z.boolean().optional(), oxygenUse: z.boolean().optional(), epilepsy: z.boolean().optional(), dietaryRestrictions: nonEmptyTextArray(), mobilityRestrictions: nonEmptyTextArray(), otherAlerts: nonEmptyTextArray() }),
  homeCare: z.object({ enabled: z.boolean(), serviceAddressSameAsPatientAddress: z.boolean(), serviceAddress: addressSchema.optional(), accessInstructions: nullableText(1000), householdRisks: nonEmptyTextArray(), mobilityConditions: nullableText(1000), caregiverName: nullableText(200), caregiverPhone: nullableText(30), preferredPeriods: nonEmptyTextArray(10, 100) }),
  administrative: z.object({ serviceType: z.enum(['private','insurance','institution','other']), insuranceName: nullableText(200), registrationNumber: nullableText(100), sessionValue: z.number().nonnegative().nullable().optional(), contractedSessions: z.number().int().nonnegative().nullable().optional(), completedSessions: z.number().int().nonnegative().optional(), paymentNotes: nullableText(2000) }),
  status: z.enum(['active','inactive','discharged','archived']), search: z.object({ normalizedName: z.string(), normalizedPhone: z.string().nullable().optional() }).optional(), createdAt: timestampSchema, createdBy: z.string().min(1), updatedAt: z.unknown().optional(), updatedBy: z.string().optional(),
}).passthrough()
