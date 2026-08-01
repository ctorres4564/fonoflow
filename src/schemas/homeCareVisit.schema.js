import { z } from 'zod'
import { HOME_CARE_VISIT_STATUSES } from '../domain/homeCare/homeCareVisitTransitions'

const nullableString = (max) => z.string().trim().max(max).nullable()
const timestamp = z.unknown().refine((value) => value != null, 'Timestamp obrigatório')
const optionalTimestamp = z.unknown().nullable()
const distance = z.number().finite().nonnegative().nullable()

export const homeCareAddressSnapshotSchema = z.object({
  postalCode: nullableString(20), street: nullableString(300), number: nullableString(30),
  complement: nullableString(150), district: nullableString(150), city: nullableString(150),
  state: nullableString(2), referencePoint: nullableString(300),
}).strict()

export const homeCareVisitSchema = z.object({
  schemaVersion: z.literal(1), appointmentId: z.string().min(1), patientId: z.string().min(1),
  professionalId: z.string().min(1), userId: z.string().min(1),
  status: z.enum(HOME_CARE_VISIT_STATUSES),
  location: z.object({ addressSnapshot: homeCareAddressSnapshotSchema, accessInstructionsSnapshot: nullableString(1000) }).strict(),
  schedule: z.object({ scheduledStart: timestamp, scheduledEnd: timestamp }).strict(),
  travel: z.object({ departureAt: optionalTimestamp, arrivalAt: optionalTimestamp, estimatedDistanceKm: distance,
    actualDistanceKm: distance, travelDurationMinutes: z.number().int().nonnegative().nullable(),
    transportationMode: z.enum(['car', 'motorcycle', 'public_transport', 'walking', 'other']).nullable() }).strict(),
  service: z.object({ startedAt: optionalTimestamp, endedAt: optionalTimestamp,
    durationMinutes: z.number().int().nonnegative().nullable(), caregiverPresent: z.boolean().nullable(),
    caregiverName: nullableString(200) }).strict(),
  occurrence: z.object({ type: z.enum(['none', 'patient_absent', 'access_problem', 'clinical_incident', 'safety_risk', 'caregiver_absent', 'service_interrupted', 'other']), description: nullableString(2000) }).strict()
    .refine((value) => value.type === 'none' || Boolean(value.description), { path: ['description'], message: 'Descreva a ocorrência.' }),
  evolutionId: nullableString(128).optional(), createdAt: timestamp, createdBy: z.string().min(1),
  updatedAt: optionalTimestamp, updatedBy: nullableString(128),
}).strict()

const immutableFields = ['appointmentId', 'patientId', 'professionalId', 'userId', 'createdAt', 'createdBy']
const parse = (value) => homeCareVisitSchema.parse(value)
const assertActor = (value, actorId) => {
  if (!actorId || value.userId !== actorId || value.professionalId !== actorId) throw new Error('Visita não pertence ao usuário autenticado.')
  return value
}
const assertImmutable = (next, current) => {
  for (const field of immutableFields) if (next[field] !== current[field]) throw new Error(`Campo imutável alterado: ${field}`)
  return next
}

export const parseHomeCareVisitCreate = (value, actorId) => assertActor(parse(value), actorId)
export const parseHomeCareDeparture = (value, current, actorId) => assertImmutable(assertActor(parse(value), actorId), current)
export const parseHomeCareArrival = parseHomeCareDeparture
export const parseHomeCareServiceStart = parseHomeCareDeparture
export const parseHomeCareCompletion = parseHomeCareDeparture
export const parseHomeCareOccurrence = parseHomeCareDeparture
export const parseHomeCareTravelUpdate = parseHomeCareDeparture

export function createHomeCareAddressSnapshot(patient, manualAddress = null) {
  const alternative = patient.homeCare?.serviceAddressSameAsPatientAddress === false ? patient.homeCare?.serviceAddress : null
  const source = alternative || patient.address || manualAddress || {}
  return homeCareAddressSnapshotSchema.parse({
    postalCode: source.postalCode || source.zipCode || null, street: source.street || null,
    number: source.number || null, complement: source.complement || null,
    district: source.district || source.neighborhood || null, city: source.city || null,
    state: source.state || null, referencePoint: source.referencePoint || null,
  })
}
