export const DOCUMENT_VERSION_STATUSES = Object.freeze([
  'draft', 'pending_upload', 'uploaded_to_quarantine', 'scanning',
  'available', 'current', 'superseded', 'blocked', 'scan_failed',
  'archived', 'restored', 'compromised',
])

export const DOCUMENT_INTEGRITY_STATUSES = Object.freeze([
  'pending', 'valid', 'invalid', 'unavailable',
])

export const DOCUMENT_RETENTION_STATUSES = Object.freeze([
  'not_applicable', 'active', 'review_due', 'expired', 'legal_hold',
])

export const RETENTION_START_EVENTS = Object.freeze([
  'document_created', 'version_created', 'patient_discharge', 'manual',
])

export const INTEGRITY_SIGNATURE_ALGORITHM = 'HMAC-SHA256'
export const DEFAULT_INTEGRITY_SIGNATURE_VERSION = 1

