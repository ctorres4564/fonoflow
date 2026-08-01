import { z } from 'zod'
export const AUDIT_PAYLOAD_LIMIT=16*1024
const actions=z.enum(['patient.created','patient.updated','patient.deleted','record.viewed','record.exported','evolution.created','evolution.revised','evolution.deleted','evolution.amendment_added','evolution.annulled','anamnesis.updated','document.uploaded','document.deleted','appointment.status_changed','consent.registered','consent.revoked','consent.validated','HOME_CARE_VISIT_CREATED','HOME_CARE_DEPARTURE_RECORDED','HOME_CARE_ARRIVAL_RECORDED','HOME_CARE_SERVICE_STARTED','HOME_CARE_VISIT_COMPLETED','HOME_CARE_PATIENT_ABSENT','HOME_CARE_VISIT_CANCELLED','HOME_CARE_OCCURRENCE_RECORDED','HOME_CARE_TRAVEL_UPDATED'])
const documentId=z.string().trim().min(1).max(128).regex(/^[^/.][^/]*$/)
export const auditPostSchema=z.object({action:actions,patientId:documentId,resourceId:documentId.optional(),changedFields:z.array(z.string().trim().min(1).max(60)).max(40).default([])}).strict()
export const auditGetSchema=z.object({limit:z.coerce.number().int().min(1).max(200).default(100)}).strict()
export function parseAuditBody(body){let bytes;try{bytes=Buffer.byteLength(JSON.stringify(body),'utf8')}catch{throw new Error('INVALID_JSON')}if(bytes>AUDIT_PAYLOAD_LIMIT)throw new Error('PAYLOAD_TOO_LARGE');return auditPostSchema.parse(body)}
export const parseAuditQuery=(query)=>auditGetSchema.parse({limit:query?.limit??100})
