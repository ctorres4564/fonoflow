import { z } from 'zod'
import {
  DOCUMENT_ACCESS_LEVELS,
  DOCUMENT_CATEGORIES,
  DOCUMENT_SENSITIVITY_LEVELS,
  DOCUMENT_STATUSES,
  MALWARE_SCAN_STATUSES,
} from '../config/documentStorage.js'

const id = z.string().trim().min(1).max(128).regex(/^[^/.][^/]*$/)
const timestamp = z.unknown().refine((value) => value != null, 'Timestamp obrigatório')
const sha = z.string().regex(/^[a-f0-9]{64}$/i)
const mime = z.string().regex(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i)

export const documentCategorySchema = z.enum(DOCUMENT_CATEGORIES)
export const documentStatusSchema = z.enum(DOCUMENT_STATUSES)
export const documentSensitivityLevelSchema = z.enum(DOCUMENT_SENSITIVITY_LEVELS)
export const documentAccessLevelSchema = z.enum(DOCUMENT_ACCESS_LEVELS)
export const malwareScanStatusSchema = z.enum(MALWARE_SCAN_STATUSES)

export const clinicalAttachmentContextSchema = z.object({
  evolutionId: id.nullable().default(null),
  appointmentId: id.nullable().default(null),
  homeCareVisitId: id.nullable().default(null),
  relatedProfessionalId: id.nullable().default(null),
}).strict()

export const clinicalAttachmentConsentContextSchema = z.object({
  requiredConsentType: z.string().trim().max(80).nullable(),
  consentId: id.nullable(),
  consentVersion: z.number().int().positive().nullable(),
  validatedAt: z.unknown().nullable(),
  validationResult: z.enum(['not_required', 'valid', 'denied']),
}).strict()

export const documentFileMetadataSchema = z.object({
  schemaVersion: z.literal(2),
  uploadId: id,
  documentId: id,
  originalFileName: z.string().trim().min(1).max(255),
  randomFileName: z.string().regex(/^[a-f0-9-]{20,80}\.[a-z0-9]{2,5}$/),
  storagePath: z.string().min(20).max(1000),
  declaredMimeType: mime,
  detectedMimeType: mime.nullable(),
  extension: z.string().regex(/^[a-z0-9]{2,5}$/),
  size: z.number().int().nonnegative(),
  sha256: sha.nullable(),
  uploadedBy: id,
  uploadedAt: timestamp.nullable(),
  status: z.enum(['pending', 'quarantine', 'available', 'blocked', 'failed']),
  requestId: id,
  scanStatus: malwareScanStatusSchema,
}).strict()

export const clinicalDocumentSchema = z.object({
  schemaVersion: z.literal(2),
  id: id.optional(),
  patientId: id,
  ownerId: id,
  organizationId: id,
  category: documentCategorySchema,
  title: z.string().trim().min(3).max(300),
  description: z.string().trim().max(2000).nullable(),
  documentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  clinicalContext: clinicalAttachmentContextSchema.optional(),
  consentContext: clinicalAttachmentConsentContextSchema.optional(),
  status: documentStatusSchema,
  sensitivityLevel: documentSensitivityLevelSchema,
  accessLevel: documentAccessLevelSchema,
  currentVersionId: id.nullable(),
  currentVersionNumber: z.number().int().positive().nullable().optional(),
  totalVersions: z.number().int().nonnegative().optional(),
  lastVersionCreatedAt: z.unknown().nullable().optional(),
  retentionPolicyId: id.nullable().optional(),
  retentionStatus: z.enum(['not_applicable', 'active', 'review_due', 'expired', 'legal_hold']).optional(),
  retentionUntil: z.unknown().nullable().optional(),
  retentionReviewAt: z.unknown().nullable().optional(),
  legalHold: z.boolean().optional(),
  legalHoldReason: z.string().trim().max(1000).nullable().optional(),
  legalHoldAt: z.unknown().nullable().optional(),
  legalHoldBy: id.nullable().optional(),
  integrityBlocked: z.boolean().optional(),
  file: documentFileMetadataSchema.nullable(),
  attachmentFinalizedAt: z.unknown().nullable().optional(),
  archivedBy: id.nullable().optional(),
  archivedAt: z.unknown().nullable().optional(),
  archiveReason: z.string().trim().max(1000).nullable().optional(),
  createdBy: id,
  createdAt: timestamp,
  updatedAt: timestamp,
}).strict().superRefine((value, context) => {
  if (value.status !== 'draft' && !value.file) {
    context.addIssue({ code: 'custom', path: ['file'], message: 'Arquivo obrigatório fora do rascunho.' })
  }
  if (value.status === 'archived' && (!value.archivedBy || !value.archivedAt || !value.archiveReason)) {
    context.addIssue({ code: 'custom', path: ['status'], message: 'Arquivamento incompleto.' })
  }
})

export const documentSecurityScanSchema = z.object({
  schemaVersion: z.literal(2),
  id: id.optional(),
  documentId: id,
  uploadId: id,
  provider: z.string().trim().min(1).max(100),
  engineVersion: z.string().trim().max(100).nullable(),
  status: malwareScanStatusSchema,
  scannedAt: timestamp.nullable(),
  threatName: z.string().trim().max(300).nullable(),
  resultCode: z.string().trim().max(100).nullable(),
  sha256: sha,
  requestId: id,
  createdAt: timestamp,
  updatedAt: timestamp,
}).strict()

export const documentUploadRequestSchema = z.object({
  patientId: id,
  documentId: id.optional(),
  requestId: id,
  category: documentCategorySchema,
  title: z.string().trim().min(3).max(300),
  description: z.string().trim().max(2000).nullable().default(null),
  documentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  clinicalContext: clinicalAttachmentContextSchema.optional(),
  consentContext: clinicalAttachmentConsentContextSchema.optional(),
  sensitivityLevel: documentSensitivityLevelSchema.default('sensitive'),
  accessLevel: documentAccessLevelSchema.default('owner_only'),
  originalFileName: z.string().trim().min(1).max(255),
  declaredMimeType: mime,
  size: z.number().int().positive(),
}).strict()

export const documentUploadResultSchema = z.object({
  documentId: id,
  uploadId: id,
  uploadUrl: z.string().url(),
  expiresAt: z.string().datetime(),
  requiredHeaders: z.record(z.string(), z.string()).default({}),
}).strict()
export const documentFinalizeRequestSchema = z.object({
  patientId: id, documentId: id, uploadId: id, requestId: id,
}).strict()
export const documentDownloadRequestSchema = z.object({
  patientId: id, documentId: id, requestId: id,
}).strict()
export const documentListRequestSchema = z.object({ patientId: id }).strict()
export const documentDownloadResultSchema = z.object({
  downloadUrl: z.string().url(),
  expiresAt: z.string().datetime(),
  documentId: id,
  fileName: z.string().min(1).max(255),
}).strict()

export const parseDocumentUploadRequest = (value) => documentUploadRequestSchema.parse(value)
export const parseDocumentFinalizeRequest = (value) => documentFinalizeRequestSchema.parse(value)
export const parseDocumentDownloadRequest = (value) => documentDownloadRequestSchema.parse(value)
export const parseDocumentListRequest = (value) => documentListRequestSchema.parse(value)
