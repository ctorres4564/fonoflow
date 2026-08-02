import { z } from 'zod'
import {
  DOCUMENT_INTEGRITY_STATUSES,
  DOCUMENT_RETENTION_STATUSES,
  DOCUMENT_VERSION_STATUSES,
  RETENTION_START_EVENTS,
} from '../config/documentVersioning.js'

const id = z.string().trim().min(1).max(128).regex(/^[^/.][^/]*$/)
const sha256 = z.string().regex(/^[a-f0-9]{64}$/i)
const timestamp = z.unknown().refine((value) => value != null, 'Timestamp obrigatório')
const mime = z.string().regex(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i)

export const documentVersionStatusSchema = z.enum(DOCUMENT_VERSION_STATUSES)
export const documentIntegrityStatusSchema = z.enum(DOCUMENT_INTEGRITY_STATUSES)
export const documentRetentionStatusSchema = z.enum(DOCUMENT_RETENTION_STATUSES)

export const documentVersionFileMetadataSchema = z.object({
  uploadId: id.nullable(),
  originalFileName: z.string().trim().min(1).max(255),
  randomFileName: z.string().trim().min(1).max(255),
  storagePath: z.string().min(20).max(1000),
  declaredMimeType: mime,
  detectedMimeType: mime,
  extension: z.string().regex(/^[a-z0-9]{2,5}$/),
  size: z.number().int().positive(),
  sha256,
}).strict()

export const documentVersionSecurityScanSchema = z.object({
  provider: z.string().trim().min(1).max(100),
  engineVersion: z.string().trim().max(100).nullable(),
  status: z.enum(['clean', 'infected', 'failed']),
  scannedAt: timestamp,
  threatName: z.string().trim().max(300).nullable(),
  resultCode: z.string().trim().max(100).nullable(),
}).strict()

export const documentVersionIntegritySchema = z.object({
  algorithm: z.literal('HMAC-SHA256'),
  signatureVersion: z.number().int().positive(),
  metadataHash: sha256,
  signature: z.string().regex(/^[a-f0-9]{64}$/i),
  signedAt: timestamp,
  signedBy: id,
}).strict()

export const documentVersionSchema = z.object({
  schemaVersion: z.literal(2),
  documentId: id,
  patientId: id,
  ownerId: id,
  versionId: id,
  versionNumber: z.number().int().positive(),
  previousVersionId: id.nullable(),
  supersedesVersionId: id.nullable(),
  changeReason: z.string().trim().min(3).max(1000),
  duplicateJustification: z.string().trim().max(1000).nullable(),
  status: documentVersionStatusSchema,
  uploadRequest: z.object({
    uploadId: id,
    originalFileName: z.string().trim().min(1).max(255),
    randomFileName: z.string().trim().min(1).max(255),
    storagePath: z.string().min(20).max(1000),
    declaredMimeType: mime,
    extension: z.string().regex(/^[a-z0-9]{2,5}$/),
    size: z.number().int().positive(),
    requestId: id,
  }).strict().nullable(),
  fileMetadata: documentVersionFileMetadataSchema.nullable(),
  securityScan: documentVersionSecurityScanSchema.nullable(),
  integrity: documentVersionIntegritySchema.nullable(),
  integrityStatus: documentIntegrityStatusSchema,
  duplicate: z.object({
    detected: z.boolean(),
    scope: z.enum(['same_document', 'patient_document']).nullable(),
    matchingDocumentId: id.nullable(),
    matchingVersionId: id.nullable(),
  }).strict(),
  createdBy: id,
  createdAt: timestamp,
  activatedAt: z.unknown().nullable(),
  supersededAt: z.unknown().nullable(),
}).strict()

export const createDocumentVersionInputSchema = z.object({
  patientId: id,
  documentId: id,
  requestId: id,
  changeReason: z.string().trim().min(3).max(1000),
  duplicateJustification: z.string().trim().max(1000).nullable().default(null),
}).strict()

export const requestDocumentVersionUploadSchema = z.object({
  patientId: id, documentId: id, versionId: id, requestId: id,
  originalFileName: z.string().trim().min(1).max(255),
  declaredMimeType: mime,
  size: z.number().int().positive(),
}).strict()

export const finalizeDocumentVersionInputSchema = z.object({
  patientId: id, documentId: id, versionId: id, uploadId: id, requestId: id,
}).strict()

export const documentVersionQuerySchema = z.object({
  patientId: id, documentId: id, versionId: id.optional(),
}).strict()

export const restoreDocumentVersionInputSchema = z.object({
  patientId: id, documentId: id, versionId: id, requestId: id,
  reason: z.string().trim().min(5).max(1000),
}).strict()

export const verifyDocumentIntegrityInputSchema = z.object({
  patientId: id, documentId: id, versionId: id, requestId: id,
}).strict()

const legalHoldBase = z.object({
  patientId: id, documentId: id, requestId: id,
})
export const applyLegalHoldInputSchema = legalHoldBase.extend({
  reason: z.string().trim().min(5).max(1000),
}).strict()
export const removeLegalHoldInputSchema = legalHoldBase.extend({
  reason: z.string().trim().min(5).max(1000),
}).strict()

export const retentionPolicySchema = z.object({
  schemaVersion: z.literal(1),
  id: id.optional(),
  name: z.string().trim().min(3).max(200),
  active: z.boolean(),
  durationDays: z.number().int().positive().max(36500),
  reviewBeforeDays: z.number().int().nonnegative().max(3650),
  startEvent: z.enum(RETENTION_START_EVENTS),
  category: z.string().trim().max(100).nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
}).strict()

export const evaluateRetentionInputSchema = z.object({
  patientId: id, documentId: id, requestId: id,
  asOf: z.string().datetime().optional(),
}).strict()

export const parseCreateDocumentVersion = (value) => createDocumentVersionInputSchema.parse(value)
export const parseRequestDocumentVersionUpload = (value) => requestDocumentVersionUploadSchema.parse(value)
export const parseFinalizeDocumentVersion = (value) => finalizeDocumentVersionInputSchema.parse(value)
export const parseDocumentVersionQuery = (value) => documentVersionQuerySchema.parse(value)
export const parseRestoreDocumentVersion = (value) => restoreDocumentVersionInputSchema.parse(value)
export const parseVerifyDocumentIntegrity = (value) => verifyDocumentIntegrityInputSchema.parse(value)
export const parseApplyLegalHold = (value) => applyLegalHoldInputSchema.parse(value)
export const parseRemoveLegalHold = (value) => removeLegalHoldInputSchema.parse(value)
export const parseEvaluateRetention = (value) => evaluateRetentionInputSchema.parse(value)
