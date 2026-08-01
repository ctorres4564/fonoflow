import { patientV2Schema, CURRENT_PATIENT_SCHEMA_VERSION } from '../schemas/patient.schema.js'

export class SchemaNormalizationError extends Error { constructor(entity, cause) { super(`Documento de ${entity} inválido`); this.name = 'SchemaNormalizationError'; this.entity = entity; this.cause = cause } }
export const normalizeSearchText = (value = '') => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ')
export const normalizeSearchPhone = (value = '') => String(value).replace(/\D/g, '')
const statusToV2 = { Ativo: 'active', Inativo: 'inactive', Finalizado: 'discharged', Arquivado: 'archived' }
const legacyStatus = { active: 'Ativo', inactive: 'Inativo', discharged: 'Finalizado', archived: 'Arquivado' }

export function convertPatientV1ToV2(raw) {
  const fullName = raw.personalData?.fullName ?? raw.name ?? raw.fullName ?? ''
  const phone = raw.contact?.phone ?? raw.phone ?? ''
  const completed = Number(raw.administrative?.completedSessions ?? raw.completedSessions ?? 0)
  const contracted = Number(raw.administrative?.contractedSessions ?? raw.totalSessions ?? 0)
  return { ...raw, schemaVersion: 2, userId: raw.userId ?? '', personalData: { fullName, socialName: null, birthDate: raw.birthDate || null, cpf: null, cns: null, sex: null, genderIdentity: null, ...raw.personalData }, contact: { phone: phone || null, secondaryPhone: null, email: null, ...raw.contact }, address: typeof raw.address === 'object' && raw.address !== null ? raw.address : { street: raw.address || null }, legalRepresentative: { name: raw.guardian || null, ...raw.legalRepresentative }, emergencyContact: raw.emergencyContact, clinicalProfile: { diagnosis: raw.diagnosis || null, diagnosticHypothesis: null, cidCodes: [], cifCodes: [], referralSource: null, mainComplaint: raw.complaint || null, generalObservations: raw.notes || null, ...raw.clinicalProfile }, clinicalAlerts: { allergies: [], medications: [], aspirationRisk: false, tracheostomy: false, gastrostomy: false, oxygenUse: false, epilepsy: false, dietaryRestrictions: [], mobilityRestrictions: [], otherAlerts: [], ...raw.clinicalAlerts }, homeCare: { enabled: raw.homeCare?.enabled ?? true, serviceAddressSameAsPatientAddress: raw.homeCare?.serviceAddressSameAsPatientAddress ?? true, ...raw.homeCare }, administrative: { serviceType: 'private', contractedSessions: contracted, completedSessions: completed, ...raw.administrative }, status: statusToV2[raw.status] || raw.status || 'active', search: { normalizedName: normalizeSearchText(fullName), normalizedPhone: normalizeSearchPhone(phone) || null }, createdAt: raw.createdAt || new Date(0), createdBy: raw.createdBy || raw.userId || 'legacy' }
}

export function normalizePatientDocument(raw) {
  if (!raw || typeof raw !== 'object') throw new SchemaNormalizationError('paciente', new TypeError('Objeto esperado'))
  if (raw.schemaVersion != null && raw.schemaVersion !== CURRENT_PATIENT_SCHEMA_VERSION) throw new SchemaNormalizationError('paciente', new Error(`Versão não suportada: ${raw.schemaVersion}`))
  const isConsolidatedV2 = raw.schemaVersion === 2 && typeof raw.address === 'object' && ['active','inactive','discharged','archived'].includes(raw.status)
  const candidate = isConsolidatedV2 ? { ...raw } : convertPatientV1ToV2({ ...raw, address: raw.addressV2 || raw.address, status: raw.patientStatusV2 || raw.status })
  try { const v2 = patientV2Schema.parse(candidate); return { ...v2, patientStatusV2: v2.status, addressV2: v2.address, name: v2.personalData.fullName, phone: v2.contact.phone || '', birthDate: v2.personalData.birthDate || '', address: typeof raw.address === 'string' ? raw.address : raw.addressLegacy || v2.address.street || '', guardian: v2.legalRepresentative?.name || '', diagnosis: v2.clinicalProfile.diagnosis || '', complaint: v2.clinicalProfile.mainComplaint || '', notes: v2.clinicalProfile.generalObservations || '', totalSessions: v2.administrative.contractedSessions || 0, completedSessions: v2.administrative.completedSessions || 0, remainingSessions: Math.max((v2.administrative.contractedSessions || 0) - (v2.administrative.completedSessions || 0), 0), status: legacyStatus[v2.status] || v2.status } } catch (error) { throw new SchemaNormalizationError('paciente', error) }
}
