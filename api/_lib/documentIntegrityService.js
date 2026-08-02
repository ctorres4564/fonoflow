import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import {
  DEFAULT_INTEGRITY_SIGNATURE_VERSION,
  INTEGRITY_SIGNATURE_ALGORITHM,
} from '../../src/config/documentVersioning.js'

const integrityError = (code, message) => Object.assign(new Error(message), { code })

function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`
}

function keyFromEnvironment(environment) {
  const configured = String(environment.DOCUMENT_INTEGRITY_HMAC_KEY || '').trim()
  if (!configured || /^(configure|change|replace|todo|example)/i.test(configured)) return null
  const encoding = environment.DOCUMENT_INTEGRITY_HMAC_KEY_ENCODING === 'base64' ? 'base64' : 'utf8'
  const key = Buffer.from(configured, encoding)
  return key.length >= 32 ? key : null
}

export function integrityPayload(version) {
  return {
    documentId: version.documentId,
    patientId: version.patientId,
    ownerId: version.ownerId,
    versionId: version.versionId,
    versionNumber: version.versionNumber,
    previousVersionId: version.previousVersionId || null,
    supersedesVersionId: version.supersedesVersionId || null,
    changeReason: version.changeReason,
    fileMetadata: version.fileMetadata,
    securityScan: version.securityScan,
    createdBy: version.createdBy,
  }
}

export function createDocumentIntegrityService(environment = process.env) {
  const key = keyFromEnvironment(environment)
  const production = environment.NODE_ENV === 'production' || environment.VERCEL_ENV === 'production'
  if (production && !key) {
    throw integrityError(
      'INTEGRITY_KEY_UNAVAILABLE',
      'DOCUMENT_INTEGRITY_HMAC_KEY ausente ou inválida; inicialização de produção bloqueada.',
    )
  }
  const signatureVersion = Number(
    environment.DOCUMENT_INTEGRITY_SIGNATURE_VERSION || DEFAULT_INTEGRITY_SIGNATURE_VERSION,
  )
  const requireKey = () => {
    if (!key) throw integrityError('INTEGRITY_KEY_UNAVAILABLE', 'Chave de integridade indisponível.')
    if (!Number.isInteger(signatureVersion) || signatureVersion <= 0) {
      throw integrityError('INTEGRITY_KEY_UNAVAILABLE', 'Versão da assinatura de integridade inválida.')
    }
  }
  return {
    sign(version, { signedAt, signedBy }) {
      requireKey()
      const metadataHash = createHash('sha256')
        .update(canonicalize(integrityPayload(version))).digest('hex')
      return {
        algorithm: INTEGRITY_SIGNATURE_ALGORITHM,
        signatureVersion,
        metadataHash,
        signature: createHmac('sha256', key).update(metadataHash).digest('hex'),
        signedAt,
        signedBy,
      }
    },
    verify(version) {
      requireKey()
      if (!version.integrity || version.integrity.algorithm !== INTEGRITY_SIGNATURE_ALGORITHM) {
        return { valid: false, reason: 'signature_missing' }
      }
      const metadataHash = createHash('sha256')
        .update(canonicalize(integrityPayload(version))).digest('hex')
      const expected = createHmac('sha256', key).update(metadataHash).digest('hex')
      const supplied = String(version.integrity.signature || '')
      const valid = metadataHash === version.integrity.metadataHash &&
        supplied.length === expected.length &&
        timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(expected, 'hex'))
      return { valid, reason: valid ? null : 'metadata_or_signature_mismatch', metadataHash }
    },
  }
}

