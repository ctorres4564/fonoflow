import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import {
  authenticateDocumentRequest,
  createDocumentStorageRepository,
} from './documentStorageFirebase.js'
import { getEvolutionAdminApp } from './evolutionFinalizeFirebase.js'

export const authenticateClinicalAttachmentRequest = authenticateDocumentRequest

export function createClinicalAttachmentRepository() {
  const storageRepository = createDocumentStorageRepository()
  const database = () => getFirestore(getEvolutionAdminApp())
  return {
    ...storageRepository,
    timestamp() { return FieldValue.serverTimestamp() },
    async listConsents(patientId) {
      const snapshot = await database().collection(`patients/${patientId}/consents`).get()
      return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
    },
    async listLinkOptions(patientId, uid) {
      const [evolutions, schedules] = await Promise.all([
        database().collection(`patients/${patientId}/evolutions`).get(),
        database().collection('schedules').where('patientId', '==', patientId).get(),
      ])
      return {
        evolutions: evolutions.docs.map((item) => ({ id: item.id, ...item.data() })),
        appointments: schedules.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .filter((item) => item.userId === uid),
      }
    },
    async recordAudit(event) {
      const reference = database().collection('auditLogs').doc()
      await reference.create({ ...event, occurredAt: FieldValue.serverTimestamp() })
      return reference.id
    },
  }
}
