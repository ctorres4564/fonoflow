import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { recordAuditEvent } from './auditService'

/**
 * Busca a anamnese cadastrada para um paciente.
 * @param {string} patientId
 * @returns {Promise<object|null>}
 */
export async function getAnamnesis(patientId) {
  if (!patientId) return null
  const docRef = doc(db, 'patients', patientId, 'anamnesis', 'data')
  const docSnap = await getDoc(docRef)
  if (docSnap.exists()) {
    return docSnap.data()
  }
  return null
}

/**
 * Cria ou atualiza a anamnese de um paciente.
 * @param {string} patientId
 * @param {object} data
 * @returns {Promise<void>}
 */
export async function saveAnamnesis(patientId, data) {
  if (!patientId) return
  const docRef = doc(db, 'patients', patientId, 'anamnesis', 'data')
  await setDoc(docRef, {
    ...data,
    updatedAt: new Date().toISOString(),
  }, { merge: true })
  await recordAuditEvent({ action: 'anamnesis.updated', patientId, resourceId: 'data', changedFields: Object.keys(data) })
}
