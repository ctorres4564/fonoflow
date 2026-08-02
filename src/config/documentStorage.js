export const DOCUMENT_STATUSES = Object.freeze([
  'draft', 'pending_upload', 'uploaded_to_quarantine', 'scanning',
  'available', 'blocked', 'scan_failed', 'archived',
])
export const MALWARE_SCAN_STATUSES = Object.freeze([
  'pending', 'scanning', 'clean', 'infected', 'failed',
])
export const CLINICAL_ATTACHMENT_CATEGORIES = Object.freeze([
  'exam', 'medical_report', 'audiometry', 'clinical_image', 'clinical_audio',
  'clinical_video', 'referral', 'school_document', 'consent_document',
  'clinical_report', 'administrative_document', 'prescription', 'therapy_plan',
  'discharge_document', 'other',
])
export const LEGACY_DOCUMENT_CATEGORIES = Object.freeze([
  'consent_term', 'image', 'audio', 'video',
])
export const DOCUMENT_CATEGORIES = Object.freeze([
  ...CLINICAL_ATTACHMENT_CATEGORIES,
  ...LEGACY_DOCUMENT_CATEGORIES,
])
export const DOCUMENT_SENSITIVITY_LEVELS = Object.freeze([
  'standard', 'sensitive', 'highly_sensitive',
])
export const DOCUMENT_ACCESS_LEVELS = Object.freeze(['owner_only', 'organization'])
export const DOCUMENT_MIME_POLICY = Object.freeze({
  'application/pdf': Object.freeze({ extensions: ['pdf'], maxBytes: 20 * 1024 * 1024 }),
  'image/jpeg': Object.freeze({ extensions: ['jpg', 'jpeg'], maxBytes: 10 * 1024 * 1024 }),
  'image/png': Object.freeze({ extensions: ['png'], maxBytes: 10 * 1024 * 1024 }),
  'audio/mpeg': Object.freeze({ extensions: ['mp3'], maxBytes: 50 * 1024 * 1024 }),
  'audio/wav': Object.freeze({ extensions: ['wav'], maxBytes: 50 * 1024 * 1024 }),
  'video/mp4': Object.freeze({ extensions: ['mp4'], maxBytes: 200 * 1024 * 1024 }),
})

const allClinicalLinks = Object.freeze([
  'evolution', 'appointment', 'home_care', 'professional',
])
const professionalOnly = Object.freeze(['professional'])
const category = (allowedMimeTypes, maxSize, options = {}) => Object.freeze({
  allowedMimeTypes: Object.freeze(allowedMimeTypes),
  maxSize,
  defaultSensitivityLevel: options.defaultSensitivityLevel || 'sensitive',
  defaultAccessLevel: options.defaultAccessLevel || 'owner_only',
  requiredConsentType: options.requiredConsentType || null,
  allowedClinicalLinks: options.allowedClinicalLinks || allClinicalLinks,
  titleRequired: true,
  documentDateRequired: Boolean(options.documentDateRequired),
})

export const DOCUMENT_CATEGORY_CONFIG = Object.freeze({
  exam: category(['application/pdf', 'image/jpeg', 'image/png'], 20 * 1024 * 1024, { documentDateRequired: true }),
  medical_report: category(['application/pdf', 'image/jpeg', 'image/png'], 20 * 1024 * 1024, { documentDateRequired: true }),
  audiometry: category(['application/pdf', 'image/jpeg', 'image/png'], 20 * 1024 * 1024, { documentDateRequired: true }),
  clinical_image: category(['image/jpeg', 'image/png'], 10 * 1024 * 1024, { requiredConsentType: 'image' }),
  clinical_audio: category(['audio/mpeg', 'audio/wav'], 50 * 1024 * 1024, { requiredConsentType: 'audio' }),
  clinical_video: category(['video/mp4'], 200 * 1024 * 1024, { requiredConsentType: 'video' }),
  referral: category(['application/pdf', 'image/jpeg', 'image/png'], 20 * 1024 * 1024, { documentDateRequired: true }),
  school_document: category(['application/pdf', 'image/jpeg', 'image/png'], 20 * 1024 * 1024),
  consent_document: category(['application/pdf', 'image/jpeg', 'image/png'], 20 * 1024 * 1024, {
    defaultSensitivityLevel: 'highly_sensitive',
    allowedClinicalLinks: professionalOnly,
  }),
  clinical_report: category(['application/pdf', 'image/jpeg', 'image/png'], 20 * 1024 * 1024, { documentDateRequired: true }),
  administrative_document: category(['application/pdf', 'image/jpeg', 'image/png'], 20 * 1024 * 1024, {
    defaultSensitivityLevel: 'standard',
    allowedClinicalLinks: Object.freeze(['appointment', 'professional']),
  }),
  prescription: category(['application/pdf', 'image/jpeg', 'image/png'], 20 * 1024 * 1024, { documentDateRequired: true }),
  therapy_plan: category(['application/pdf', 'image/jpeg', 'image/png'], 20 * 1024 * 1024),
  discharge_document: category(['application/pdf', 'image/jpeg', 'image/png'], 20 * 1024 * 1024, { documentDateRequired: true }),
  other: category(
    ['application/pdf', 'image/jpeg', 'image/png', 'audio/mpeg', 'audio/wav', 'video/mp4'],
    200 * 1024 * 1024,
  ),
})

export const DOCUMENT_CATEGORY_LABELS = Object.freeze({
  exam: 'Exame',
  medical_report: 'Relatório médico',
  audiometry: 'Audiometria',
  clinical_image: 'Imagem clínica',
  clinical_audio: 'Áudio clínico',
  clinical_video: 'Vídeo clínico',
  referral: 'Encaminhamento',
  school_document: 'Documento escolar',
  consent_document: 'Documento de consentimento',
  clinical_report: 'Relatório clínico',
  administrative_document: 'Documento administrativo',
  prescription: 'Prescrição',
  therapy_plan: 'Plano terapêutico',
  discharge_document: 'Documento de alta',
  other: 'Outro',
})

export const DOWNLOAD_TTL_MS = 5 * 60 * 1000
export const UPLOAD_TTL_MS = 10 * 60 * 1000

export function extensionOf(fileName) {
  const normalized = String(fileName || '').normalize('NFKC').toLowerCase()
  if (normalized.includes('/') || normalized.includes('\\') || normalized.includes('..')) {
    throw new Error('Nome de arquivo inseguro.')
  }
  const parts = normalized.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error('Nome deve conter uma única extensão.')
  }
  return parts[1]
}

export function assertDeclaredFile({ fileName, declaredMimeType, size }) {
  const policy = DOCUMENT_MIME_POLICY[declaredMimeType]
  if (!policy) throw new Error('MIME não permitido.')
  const extension = extensionOf(fileName)
  if (!policy.extensions.includes(extension)) throw new Error('Extensão incompatível.')
  if (!Number.isInteger(size) || size <= 0 || size > policy.maxBytes) {
    throw new Error('Tamanho de arquivo inválido.')
  }
  return { extension, policy }
}

export function assertCategoryFile({ category: categoryName, declaredMimeType, size }) {
  const config = DOCUMENT_CATEGORY_CONFIG[categoryName]
  if (!config) throw new Error('Categoria de anexo inválida.')
  if (!config.allowedMimeTypes.includes(declaredMimeType)) {
    throw new Error('Tipo de arquivo incompatível com a categoria.')
  }
  if (!Number.isInteger(size) || size <= 0 || size > config.maxSize) {
    throw new Error('Arquivo excede o limite da categoria.')
  }
  return config
}
