import { doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'

export const objectiveStatuses = ['Não iniciado', 'Em desenvolvimento', 'Parcialmente atingido', 'Atingido', 'Reavaliar', 'Suspenso']
export const objectiveAreas = ['Linguagem', 'Fala', 'Voz', 'Audição', 'Disfagia', 'Motricidade orofacial', 'Comunicação', 'Outro']

export function subscribeTherapeuticPlan(patientId, callback, onError) {
  return onSnapshot(
    doc(db, 'patients', patientId, 'therapeuticPlan', 'current'),
    (snapshot) => callback(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null),
    onError,
  )
}

export function applyObjectiveProgress(objectives = [], progress = []) {
  const progressById = new Map(progress.map((item) => [item.objectiveId, item]))
  const now = new Date().toISOString()
  return objectives.map((objective) => {
    const update = progressById.get(objective.id)
    if (!update) return objective
    return {
      ...objective,
      status: update.status || objective.status,
      lastPerformance: update.performance || '',
      lastProgressAt: now,
    }
  })
}

export async function saveTherapeuticPlan(patientId, values) {
  const planRef = doc(db, 'patients', patientId, 'therapeuticPlan', 'current')
  const patientRef = doc(db, 'patients', patientId)
  const objectives = values.objectives || []

  await runTransaction(db, async (transaction) => {
    const planSnapshot = await transaction.get(planRef)
    transaction.set(planRef, {
      ...values,
      objectives,
      createdAt: planSnapshot.exists() ? planSnapshot.data().createdAt : serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    transaction.update(patientRef, {
      therapeuticPlanStatus: values.status,
      therapeuticReviewDate: values.reviewDate || '',
      therapeuticObjectivesCount: objectives.length,
      therapeuticAchievedCount: objectives.filter((objective) => objective.status === 'Atingido').length,
      updatedAt: serverTimestamp(),
    })
  })
}
