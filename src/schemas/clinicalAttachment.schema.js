import { z } from 'zod'
import {
  CLINICAL_ATTACHMENT_CATEGORIES,
  DOCUMENT_CATEGORY_CONFIG,
  DOCUMENT_STATUSES,
} from '../config/documentStorage.js'
import {
  clinicalAttachmentConsentContextSchema,
  clinicalAttachmentContextSchema,
  clinicalDocumentSchema,
} from './documentStorage.schema.js'

const id = z.string().trim().min(1).max(128).regex(/^[^/.][^/]*$/)
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
export const clinicalAttachmentCategorySchema = z.enum(CLINICAL_ATTACHMENT_CATEGORIES)
export const clinicalAttachmentStatusSchema = z.enum(DOCUMENT_STATUSES)
export { clinicalAttachmentContextSchema, clinicalAttachmentConsentContextSchema }

const metadata = z.object({
  patientId: id,
  requestId: id,
  category: clinicalAttachmentCategorySchema,
  title: z.string().trim().min(3).max(300),
  description: z.string().trim().max(2000).nullable().default(null),
  documentDate: date.nullable().default(null),
  clinicalContext: clinicalAttachmentContextSchema.default({}),
}).strict().superRefine((value, context) => {
  const config = DOCUMENT_CATEGORY_CONFIG[value.category]
  if (config.documentDateRequired && !value.documentDate) {
    context.addIssue({
      code: 'custom', path: ['documentDate'],
      message: 'Data do documento obrigatória para a categoria.',
    })
  }
  const links = {
    evolution: Boolean(value.clinicalContext.evolutionId),
    appointment: Boolean(value.clinicalContext.appointmentId),
    home_care: Boolean(value.clinicalContext.homeCareVisitId),
    professional: Boolean(value.clinicalContext.relatedProfessionalId),
  }
  for (const [link, present] of Object.entries(links)) {
    if (present && !config.allowedClinicalLinks.includes(link)) {
      context.addIssue({
        code: 'custom', path: ['clinicalContext'],
        message: `Vínculo ${link} não permitido para a categoria.`,
      })
    }
  }
  if (value.clinicalContext.homeCareVisitId && !value.clinicalContext.appointmentId) {
    context.addIssue({
      code: 'custom', path: ['clinicalContext', 'appointmentId'],
      message: 'Atendimento domiciliar exige agendamento.',
    })
  }
})

export const createClinicalAttachmentInputSchema = metadata
export const requestClinicalAttachmentUploadSchema = z.object({
  patientId: id,
  documentId: id,
  requestId: id,
  originalFileName: z.string().trim().min(1).max(255),
  declaredMimeType: z.string().regex(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i),
  size: z.number().int().positive(),
}).strict()
export const finalizeClinicalAttachmentInputSchema = z.object({
  patientId: id, documentId: id, uploadId: id, requestId: id,
}).strict()
export const listClinicalAttachmentsQuerySchema = z.object({
  patientId: id, includeArchived: z.boolean().default(false),
}).strict()
export const getClinicalAttachmentInputSchema = z.object({ patientId: id, documentId: id }).strict()
export const linkClinicalAttachmentInputSchema = z.object({
  patientId: id,
  documentId: id,
  requestId: id,
  linkType: z.enum(['evolution', 'appointment', 'home_care']),
  targetId: id,
}).strict()
export const archiveClinicalAttachmentInputSchema = z.object({
  patientId: id, documentId: id, requestId: id,
  reason: z.string().trim().min(5).max(1000),
}).strict()
export const downloadClinicalAttachmentInputSchema = z.object({
  patientId: id, documentId: id, requestId: id,
}).strict()

export const clinicalAttachmentSchema = clinicalDocumentSchema.superRefine((value, context) => {
  if (!CLINICAL_ATTACHMENT_CATEGORIES.includes(value.category)) {
    context.addIssue({ code: 'custom', path: ['category'], message: 'Categoria clínica inválida.' })
  }
  const required = DOCUMENT_CATEGORY_CONFIG[value.category]?.requiredConsentType || null
  if (required && value.consentContext?.requiredConsentType !== required) {
    context.addIssue({
      code: 'custom', path: ['consentContext'],
      message: 'Consentimento incompatível com a categoria.',
    })
  }
})

export const parseCreateClinicalAttachment = (value) => createClinicalAttachmentInputSchema.parse(value)
export const parseRequestClinicalAttachmentUpload = (value) => requestClinicalAttachmentUploadSchema.parse(value)
export const parseFinalizeClinicalAttachment = (value) => finalizeClinicalAttachmentInputSchema.parse(value)
export const parseListClinicalAttachments = (value) => listClinicalAttachmentsQuerySchema.parse(value)
export const parseGetClinicalAttachment = (value) => getClinicalAttachmentInputSchema.parse(value)
export const parseLinkClinicalAttachment = (value) => linkClinicalAttachmentInputSchema.parse(value)
export const parseArchiveClinicalAttachment = (value) => archiveClinicalAttachmentInputSchema.parse(value)
export const parseDownloadClinicalAttachment = (value) => downloadClinicalAttachmentInputSchema.parse(value)
