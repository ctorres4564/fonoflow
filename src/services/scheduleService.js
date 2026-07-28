import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '../firebase/config'

const schedulesCollection = collection(db, 'schedules')

export function subscribeSchedules(userId, callback, onError) {
  const q = query(schedulesCollection, where('userId', '==', userId))

  return onSnapshot(
    q,
    (snapshot) => {
      const schedules = snapshot.docs
        .map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        .sort((a, b) => {
          // Ordenar por data e horário de início
          const dateTimeA = `${a.date || ''}T${a.startTime || ''}`
          const dateTimeB = `${b.date || ''}T${b.startTime || ''}`
          return dateTimeA.localeCompare(dateTimeB)
        })
      callback(schedules)
    },
    onError,
  )
}

export function createSchedule(payload) {
  return addDoc(schedulesCollection, {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export function updateSchedule(scheduleId, payload) {
  return updateDoc(doc(db, 'schedules', scheduleId), {
    ...payload,
    updatedAt: serverTimestamp(),
  })
}

export function removeSchedule(scheduleId) {
  return deleteDoc(doc(db, 'schedules', scheduleId))
}

export async function changeScheduleStatus(scheduleId, patientId, { status, reason = '', deductSession = false }) {
  const scheduleRef = doc(db, 'schedules', scheduleId)
  const patientRef = doc(db, 'patients', patientId)
  const historyRef = doc(collection(scheduleRef, 'statusHistory'))

  await runTransaction(db, async (transaction) => {
    const scheduleSnapshot = await transaction.get(scheduleRef)
    const patientSnapshot = await transaction.get(patientRef)
    if (!scheduleSnapshot.exists()) throw new Error('Agendamento não encontrado.')
    if (!patientSnapshot.exists()) throw new Error('Paciente não encontrado.')

    const schedule = scheduleSnapshot.data()
    if (schedule.patientId !== patientId) throw new Error('Agendamento não pertence ao paciente.')

    const wasDeducted = schedule.sessionDeducted === true
    const shouldDeduct = deductSession === true
    const adjustment = Number(shouldDeduct) - Number(wasDeducted)
    const patient = patientSnapshot.data()

    if (adjustment !== 0) {
      const completedSessions = Math.max((Number(patient.completedSessions) || 0) + adjustment, 0)
      const remainingSessions = Math.max((Number(patient.totalSessions) || 0) - completedSessions, 0)
      transaction.update(patientRef, {
        completedSessions,
        remainingSessions,
        status: remainingSessions > 0 ? 'Ativo' : 'Finalizado',
        updatedAt: serverTimestamp(),
      })
    }

    transaction.update(scheduleRef, {
      status,
      statusReason: reason,
      statusUpdatedAt: serverTimestamp(),
      sessionDeducted: shouldDeduct,
      updatedAt: serverTimestamp(),
    })
    transaction.set(historyRef, {
      previousStatus: schedule.status || 'Agendado',
      status,
      reason,
      deductSession: shouldDeduct,
      changedAt: serverTimestamp(),
    })
  })
}

export async function rescheduleAppointment(scheduleId, { date, startTime, endTime, reason = '' }) {
  const scheduleRef = doc(db, 'schedules', scheduleId)
  const newScheduleRef = doc(schedulesCollection)
  const historyRef = doc(collection(scheduleRef, 'statusHistory'))

  await runTransaction(db, async (transaction) => {
    const scheduleSnapshot = await transaction.get(scheduleRef)
    if (!scheduleSnapshot.exists()) throw new Error('Agendamento não encontrado.')
    const schedule = scheduleSnapshot.data()
    const patientRef = doc(db, 'patients', schedule.patientId)
    const patientSnapshot = await transaction.get(patientRef)
    if (!patientSnapshot.exists()) throw new Error('Paciente não encontrado.')
    if (schedule.status === 'Realizado' || schedule.evolutionId) {
      throw new Error('Atendimentos realizados não podem ser reagendados.')
    }
    if (schedule.status === 'Reagendado' || schedule.rescheduledToId) {
      throw new Error('Este agendamento já foi reagendado.')
    }

    if (schedule.sessionDeducted === true) {
      const patient = patientSnapshot.data()
      const completedSessions = Math.max((Number(patient.completedSessions) || 0) - 1, 0)
      const remainingSessions = Math.max((Number(patient.totalSessions) || 0) - completedSessions, 0)
      transaction.update(patientRef, {
        completedSessions,
        remainingSessions,
        status: remainingSessions > 0 ? 'Ativo' : 'Finalizado',
        updatedAt: serverTimestamp(),
      })
    }

    transaction.set(newScheduleRef, {
      patientId: schedule.patientId,
      patientName: schedule.patientName,
      sessionType: schedule.sessionType,
      notes: schedule.notes || '',
      userId: schedule.userId,
      date,
      startTime,
      endTime,
      status: 'Agendado',
      rescheduledFromId: scheduleId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    transaction.update(scheduleRef, {
      status: 'Reagendado',
      statusReason: reason,
      statusUpdatedAt: serverTimestamp(),
      rescheduledToId: newScheduleRef.id,
      sessionDeducted: false,
      updatedAt: serverTimestamp(),
    })
    transaction.set(historyRef, {
      previousStatus: schedule.status || 'Agendado',
      status: 'Reagendado',
      reason,
      deductSession: false,
      linkedScheduleId: newScheduleRef.id,
      changedAt: serverTimestamp(),
    })
  })

  return newScheduleRef.id
}
