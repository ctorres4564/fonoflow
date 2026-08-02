import { appointmentV2Schema } from './appointment.schema.js'
import { evolutionV2Schema } from './evolution.schema.js'
import { patientV2Schema } from './patient.schema.js'
import { removeUndefined } from './common.schema.js'
import { z } from 'zod'

const PROTECTED = new Set(['id', 'userId', 'createdAt', 'createdBy', 'patientId', 'professionalId'])
const withoutProtected = (payload) => Object.fromEntries(Object.entries(payload || {}).filter(([key]) => !PROTECTED.has(key)))
const parse = (schema, payload) => removeUndefined(schema.parse(removeUndefined(payload)))

export function parsePatientForCreate(payload, actorId, timestamp) {
  return parse(patientV2Schema, { ...payload, schemaVersion: 2, userId: actorId, createdBy: actorId, createdAt: timestamp })
}

export function parsePatientForUpdate(payload, current, actorId, timestamp) {
  return parse(patientV2Schema, { ...current, ...withoutProtected(payload), schemaVersion: 2, userId: current.userId, createdBy: current.createdBy, createdAt: current.createdAt, updatedBy: actorId, updatedAt: timestamp })
}

export function parseAppointmentForCreate(payload, actorId, timestamp) {
  return parse(appointmentV2Schema, { ...payload, schemaVersion: 2, userId: actorId, createdBy: actorId, createdAt: timestamp })
}

export function parseAppointmentForUpdate(payload, current, timestamp) {
  return parse(appointmentV2Schema, { ...current, ...withoutProtected(payload), schemaVersion: 2, userId: current.userId, patientId: current.patientId, createdBy: current.createdBy, createdAt: current.createdAt, updatedAt: timestamp })
}

export function parseEvolutionDraft(payload, patientId, professionalId, timestamp) {
  return parse(evolutionV2Schema, { ...payload, schemaVersion: 2, patientId, professionalId, status: 'draft', createdBy: professionalId, createdAt: payload.createdAt || timestamp })
}

export function parseEvolutionFinalization(payload, patientId, professionalId, timestamp) {
  return parse(evolutionV2Schema, { ...payload, schemaVersion: 2, patientId, professionalId, status: 'finalized', finalizedBy: professionalId, finalizedAt: timestamp, createdBy: payload.createdBy || professionalId, createdAt: payload.createdAt || timestamp })
}

const draftSchema=z.object({schemaVersion:z.literal(2),patientId:z.string().min(1),professionalId:z.string().min(1),serviceDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),durationMinutes:z.number().int().nonnegative(),richText:z.object({html:z.string().nullable().optional(),json:z.record(z.string(),z.unknown()).nullable().optional(),plainText:z.string().max(50000)}),status:z.literal('draft'),createdAt:z.unknown(),createdBy:z.string().min(1),updatedAt:z.unknown().optional()}).strict()
const amendmentSchema=z.object({content:z.record(z.string(),z.unknown()).nullable().optional(),plainText:z.string().trim().min(1).max(50000),authorId:z.string().min(1).max(128),createdAt:z.unknown()}).strict()
const voidSchema=z.object({voided:z.literal(true),status:z.literal('voided'),voidedAt:z.unknown(),voidedBy:z.string().min(1).max(128),voidReason:z.string().trim().min(1).max(2000)}).strict()

export function parseEvolutionDraftCreate(payload,patientId,professionalId,timestamp){return parse(draftSchema,{schemaVersion:2,patientId,professionalId,serviceDate:payload.serviceDate||payload.date,durationMinutes:Number(payload.durationMinutes??payload.duration??0),richText:payload.richText||{html:null,json:payload.richContent||null,plainText:payload.notes||''},status:'draft',createdAt:timestamp,createdBy:professionalId,updatedAt:timestamp})}
export function parseEvolutionDraftUpdate(payload,current,professionalId,timestamp){if(current.patientId!==payload.patientId&&payload.patientId)throw new Error('patientId Ã© imutÃ¡vel.');if(current.professionalId!==professionalId)throw new Error('professionalId Ã© imutÃ¡vel.');return parse(draftSchema,{...current,serviceDate:payload.serviceDate||payload.date||current.serviceDate,durationMinutes:Number(payload.durationMinutes??payload.duration??current.durationMinutes),richText:payload.richText||{html:null,json:payload.richContent||null,plainText:payload.notes??current.richText.plainText},updatedAt:timestamp})}
export const parseEvolutionFinalize=parseEvolutionFinalization
export function parseEvolutionVoid(reason,professionalId,timestamp){return parse(voidSchema,{voided:true,status:'voided',voidedAt:timestamp,voidedBy:professionalId,voidReason:reason})}
export function parseEvolutionAmendmentCreate(payload,authorId,timestamp){return parse(amendmentSchema,{content:payload.content??null,plainText:payload.plainText,authorId,createdAt:timestamp})}
