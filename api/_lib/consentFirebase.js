import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { getEvolutionAdminApp } from './evolutionFinalizeFirebase.js'

export async function authenticateConsentRequest(token) {
  const decoded = await getAuth(getEvolutionAdminApp()).verifyIdToken(token, true)
  if (!decoded?.uid) throw new Error('unauthenticated')
  return { uid: decoded.uid }
}

export function createConsentRepository() {
  const database = () => getFirestore(getEvolutionAdminApp())
  return {
    createId(path) { return database().collection(path).doc().id },
    timestamp() { return FieldValue.serverTimestamp() },
    async read(path) { const snapshot=await database().doc(path).get();return snapshot.exists?snapshot.data():null },
    async list(patientId) { const snapshot=await database().collection(`patients/${patientId}/consents`).get();return snapshot.docs.map((item)=>({id:item.id,...item.data()})) },
    async recordAudit(event) { const ref=database().collection('auditLogs').doc();await ref.create({...event,occurredAt:FieldValue.serverTimestamp()});return ref.id },
    runTransaction(callback) { const db=database();return db.runTransaction(async(native)=>callback({
      async readMany(paths){const snapshots=await Promise.all(paths.map((path)=>native.get(db.doc(path))));return snapshots.map((snapshot)=>snapshot.exists?snapshot.data():null)},
      create(path,value){native.create(db.doc(path),value)}, update(path,value){native.update(db.doc(path),value)}, set(path,value){native.set(db.doc(path),value)},
    })) },
  }
}
