import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  endAt,
  onSnapshot,
  orderBy,
  query,
  startAt,
  serverTimestamp,
  runTransaction,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { applyObjectiveProgress } from './therapeuticPlanService'
import { recordAuditEvent } from './auditService'
import { convertPatientV1ToV2, normalizePatientDocument } from '../mappers/patient.mapper'
import { normalizeEvolutionDocument } from '../mappers/evolution.mapper'
import { convertAppointmentV1ToV2, normalizeAppointmentDocument } from '../mappers/appointment.mapper'
import { parsePatientForCreate, parsePatientForUpdate } from '../schemas/persistence.parsers'
import { parseAppointmentForUpdate, parseEvolutionAmendmentCreate, parseEvolutionDraftCreate, parseEvolutionDraftUpdate, parseEvolutionFinalize, parseEvolutionVoid } from '../schemas/persistence.parsers'
import { appointmentStatusToV2, assertAppointmentTransition, calculateSessionAccounting } from '../domain/appointments/appointmentTransitions'

const patientsCollection = collection(db, 'patients')

function consolidatedEvolution(patientId, payload) {
  const author = payload.createdBy || payload.authorId || payload.professionalId
  return {
    ...payload, schemaVersion: 2, patientId, professionalId: author,
    appointmentId: payload.appointmentId ?? payload.scheduleId ?? null,
    serviceDate: payload.serviceDate || payload.date,
    durationMinutes: Number(payload.durationMinutes ?? payload.duration ?? 0),
    structuredContent: payload.structuredContent || { sessionObjectives: [], procedures: [], clinicalFindings: payload.clinicalActivity || null, patientResponse: payload.observedResponse || null, performanceSummary: null, incidents: null, familyGuidance: null, nextSessionPlan: payload.nextStep || null },
    richText: payload.richText || { html: null, json: payload.richContent || null, plainText: payload.notes || '' },
    status: payload.voided ? 'voided' : (payload.status || 'finalized'), createdBy: author,
  }
}

export function subscribePatients(userId, callback, onError) {
  const q = query(patientsCollection, where('userId', '==', userId))

  return onSnapshot(
    q,
    (snapshot) => {
      const patients = snapshot.docs
        .map((patientDoc) => normalizePatientDocument({ id: patientDoc.id, ...patientDoc.data() }))
        .sort((a, b) => {
          const aTime = a.createdAt?.seconds || 0
          const bTime = b.createdAt?.seconds || 0
          return bTime - aTime
        })
      callback(patients)
    },
    onError,
  )
}

export async function searchPatients(userId, term, mode = 'name') {
  const normalized = mode === 'phone'
    ? String(term || '').replace(/\D/g, '')
    : String(term || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ')
  if (!normalized) return []
  const field = mode === 'phone' ? 'search.normalizedPhone' : 'search.normalizedName'
  const snapshot = await getDocs(query(
    patientsCollection,
    where('userId', '==', userId),
    orderBy(field),
    startAt(normalized),
    endAt(`${normalized}\uf8ff`),
  ))
  return snapshot.docs.map((item) => normalizePatientDocument({ id: item.id, ...item.data() }))
}

export async function createPatient(payload) {
  const timestamp = serverTimestamp()
  const parsed = parsePatientForCreate(payload, payload.userId, timestamp)
  const patientRef = await addDoc(patientsCollection, { ...parsed, updatedAt: timestamp })
  await recordAuditEvent({ action: 'patient.created', patientId: patientRef.id, resourceId: patientRef.id, changedFields: Object.keys(payload).filter((key) => key !== 'userId') })
  return patientRef
}

export async function updatePatient(patientId, payload) {
  const patientRef = doc(db, 'patients', patientId)
  const snapshot = await getDoc(patientRef)
  if (!snapshot.exists()) throw new Error('Paciente nÃ£o encontrado.')
  const current = convertPatientV1ToV2(snapshot.data())
  const parsed = parsePatientForUpdate(payload, current, current.userId, serverTimestamp())
  await updateDoc(patientRef, parsed)
  await recordAuditEvent({ action: 'patient.updated', patientId, resourceId: patientId, changedFields: Object.keys(payload).filter((key) => key !== 'userId') })
}

export function removePatient(patientId) {
  return deleteDoc(doc(db, 'patients', patientId))
}

export function subscribeEvolutions(patientId, callback, onError) {
  const evolutionsCollection = collection(db, 'patients', patientId, 'evolutions')

  return onSnapshot(
    evolutionsCollection,
    (snapshot) => {
      const evolutions = snapshot.docs
        .map((doc) => normalizeEvolutionDocument({ id: doc.id, patientId, ...doc.data() }))
        .sort((a, b) => {
          // Ordenar por data da sessão (decrescente, mais recentes primeiro)
          const dateA = a.date || ''
          const dateB = b.date || ''
          if (dateA !== dateB) {
            return dateB.localeCompare(dateA)
          }
          // Fallback para data de criação
          const aTime = a.createdAt?.seconds || 0
          const bTime = b.createdAt?.seconds || 0
          return bTime - aTime
        })
      callback(evolutions)
    },
    onError,
  )
}

export function createEvolution(patientId, payload) {
  const evolutionsCollection = collection(db, 'patients', patientId, 'evolutions')
  const timestamp=serverTimestamp();const candidate=consolidatedEvolution(patientId,payload)
  return addDoc(evolutionsCollection,parseEvolutionFinalize(candidate,patientId,candidate.professionalId,timestamp))
}

// A evolução original é imutável após o registro: exclusão e reescrita de
// conteúdo não são mais permitidas (ver firestore.rules). Correções passam a
// ser feitas por meio de retificações (addEvolutionAmendment) ou anulação
// (annulEvolution), preservando o registro original e a trilha de auditoria.

export async function getEvolutionAmendments(patientId, evolutionId) {
  const amendmentsQuery = query(
    collection(db, 'patients', patientId, 'evolutions', evolutionId, 'amendments'),
    orderBy('createdAt', 'asc'),
  )
  const snapshot = await getDocs(amendmentsQuery)
  return snapshot.docs.map((amendmentDoc) => ({ id: amendmentDoc.id, ...amendmentDoc.data() }))
}

// Cria uma retificação sem alterar o conteúdo original da evolução.
export async function addEvolutionAmendment(patientId, evolutionId, { content, plainText }, authorId) {
  const amendmentsCollection = collection(db, 'patients', patientId, 'evolutions', evolutionId, 'amendments')
  const amendmentRef = await addDoc(amendmentsCollection, parseEvolutionAmendmentCreate({content,plainText},authorId,serverTimestamp()))
  await recordAuditEvent({ action: 'evolution.amendment_added', patientId, resourceId: evolutionId, changedFields: ['content', 'plainText'] })
  return amendmentRef.id
}

// Anula uma evolução mediante justificativa, sem alterar seu conteúdo original.
// Só é permitido anular uma vez; o registro permanece visível no histórico.
export async function annulEvolution(patientId, evolutionId, reason, authorId) {
  const evolutionRef = doc(db, 'patients', patientId, 'evolutions', evolutionId)
  const snapshot=await getDoc(evolutionRef);if(!snapshot.exists())throw new Error('EvoluÃ§Ã£o nÃ£o encontrada.')
  const current=normalizeEvolutionDocument({id:evolutionId,patientId,...snapshot.data()});if(current.status==='voided'||current.voided)throw new Error('EvoluÃ§Ã£o jÃ¡ anulada.')
  await updateDoc(evolutionRef, parseEvolutionVoid(reason,authorId,serverTimestamp()))
  await recordAuditEvent({ action: 'evolution.annulled', patientId, resourceId: evolutionId, changedFields: ['voided', 'voidReason'] })
}

export function subscribeProgressAnalyses(patientId, callback, onError) {
  const analysesCollection = collection(db, 'patients', patientId, 'progressAnalyses')
  return onSnapshot(
    analysesCollection,
    (snapshot) => {
      const analyses = snapshot.docs
        .map((analysisDoc) => ({ id: analysisDoc.id, ...analysisDoc.data() }))
        .sort((a, b) => (b.updatedAt?.seconds || b.createdAt?.seconds || 0) - (a.updatedAt?.seconds || a.createdAt?.seconds || 0))
      callback(analyses)
    },
    onError,
  )
}

export async function saveProgressAnalysis(patientId, text, analysisId = '') {
  if (analysisId) {
    await updateDoc(doc(db, 'patients', patientId, 'progressAnalyses', analysisId), {
      text,
      updatedAt: serverTimestamp(),
    })
    return analysisId
  }

  const analysisRef = await addDoc(collection(db, 'patients', patientId, 'progressAnalyses'), {
    text,
    source: 'IA',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return analysisRef.id
}

export function subscribeEvolutionDrafts(patientId, callback, onError) {
  return onSnapshot(
    collection(db, 'patients', patientId, 'evolutionDrafts'),
    (snapshot) => {
      const drafts = snapshot.docs
        .map((draftDoc) => ({ id: draftDoc.id, ...draftDoc.data() }))
        .sort((a, b) => (b.updatedAt?.seconds || b.createdAt?.seconds || 0) - (a.updatedAt?.seconds || a.createdAt?.seconds || 0))
      callback(drafts)
    },
    onError,
  )
}

export async function saveEvolutionDraft(patientId, values, draftId = '') {
  const authorId=values.professionalId||values.createdBy||values.authorId
  if(!authorId)throw new Error('Profissional responsÃ¡vel Ã© obrigatÃ³rio.')
  const timestamp=serverTimestamp()
  if (draftId) {
    const ref=doc(db,'patients',patientId,'evolutionDrafts',draftId);const snapshot=await getDoc(ref);if(!snapshot.exists())throw new Error('Rascunho nÃ£o encontrado.')
    const current=snapshot.data().schemaVersion===2?snapshot.data():parseEvolutionDraftCreate(snapshot.data(),patientId,authorId,snapshot.data().createdAt||timestamp)
    await updateDoc(ref,parseEvolutionDraftUpdate(values,current,authorId,timestamp))
    return draftId
  }
  const draftRef = await addDoc(collection(db, 'patients', patientId, 'evolutionDrafts'), parseEvolutionDraftCreate(values,patientId,authorId,timestamp))
  return draftRef.id
}

export async function completeScheduledEvolution(patientId, scheduleId, payload) {
  const patientRef = doc(db, 'patients', patientId)
  const scheduleRef = doc(db, 'schedules', scheduleId)
  const evolutionRef = doc(collection(db, 'patients', patientId, 'evolutions'))
  const planRef = doc(db, 'patients', patientId, 'therapeuticPlan', 'current')

  await runTransaction(db, async (transaction) => {
    const [patientSnapshot, scheduleSnapshot, planSnapshot] = await Promise.all([
      transaction.get(patientRef),
      transaction.get(scheduleRef),
      transaction.get(planRef),
    ])

    if (!patientSnapshot.exists()) throw new Error('Paciente não encontrado.')
    if (!scheduleSnapshot.exists()) throw new Error('Agendamento não encontrado.')

    const scheduleRaw = scheduleSnapshot.data();const schedule=normalizeAppointmentDocument({id:scheduleId,...scheduleRaw})
    if (schedule.patientId !== patientId) throw new Error('Agendamento não pertence ao paciente.')
    if (appointmentStatusToV2(schedule.status) === 'completed' || schedule.evolutionId) {
      const error = new Error('Este atendimento já foi registrado.')
      error.code = 'schedule/already-completed'
      throw error
    }

    assertAppointmentTransition(schedule.status,'completed')
    const patientRaw=patientSnapshot.data();const currentPatientV2=convertPatientV1ToV2(patientRaw);const patient=normalizePatientDocument({id:patientId,...currentPatientV2});const accounting=calculateSessionAccounting(patient,true);const timestamp=serverTimestamp()
    const candidate=consolidatedEvolution(patientId,payload)

    transaction.set(evolutionRef, {
      ...parseEvolutionFinalize(candidate,patientId,candidate.professionalId,timestamp),
      scheduleId,
      createdAt: timestamp,
    })
    transaction.update(patientRef, parsePatientForUpdate({
      completedSessions: accounting.completedSessions, remainingSessions: accounting.remainingSessions, administrative:{...currentPatientV2.administrative,completedSessions:accounting.completedSessions},
      status: accounting.remainingSessions > 0 ? 'active' : 'discharged', updatedAt:timestamp,
    },currentPatientV2,candidate.professionalId,timestamp))
    transaction.update(scheduleRef, parseAppointmentForUpdate({
      status: 'completed', schemaVersion:2,
      evolutionId: evolutionRef.id,
      sessionDeducted: true,
      completedAt: serverTimestamp(),
      sessionAccounting:{...(scheduleRaw.sessionAccounting||{}),deductSession:true,deductedAt:timestamp,deductionOperationId:evolutionRef.id},updatedAt:timestamp,
    },convertAppointmentV1ToV2(scheduleRaw),timestamp))
    if (planSnapshot.exists() && payload.objectiveProgress?.length > 0) {
      const objectives = applyObjectiveProgress(planSnapshot.data().objectives, payload.objectiveProgress)
      transaction.update(planRef, { objectives, updatedAt: serverTimestamp() })
      transaction.update(patientRef, {
        therapeuticAchievedCount: objectives.filter((objective) => objective.status === 'Atingido').length,
      })
    }
  })

  await recordAuditEvent({ action: 'evolution.created', patientId, resourceId: evolutionRef.id, changedFields: Object.keys(payload) })

  return evolutionRef.id
}

export async function createClinicalEvolution(patientId, payload, incrementSession = true) {
  const patientRef = doc(db, 'patients', patientId)
  const planRef = doc(db, 'patients', patientId, 'therapeuticPlan', 'current')
  const evolutionRef = doc(collection(db, 'patients', patientId, 'evolutions'))

  await runTransaction(db, async (transaction) => {
    const [patientSnapshot, planSnapshot] = await Promise.all([
      transaction.get(patientRef),
      transaction.get(planRef),
    ])
    if (!patientSnapshot.exists()) throw new Error('Paciente não encontrado.')

    const candidate=consolidatedEvolution(patientId,payload);const timestamp=serverTimestamp()
    transaction.set(evolutionRef, parseEvolutionFinalize(candidate,patientId,candidate.professionalId,timestamp))
    const patientUpdates = { updatedAt: serverTimestamp() }
    if (incrementSession) {
      const patientRaw=patientSnapshot.data();const currentPatientV2=convertPatientV1ToV2(patientRaw);const patient=normalizePatientDocument({id:patientId,...currentPatientV2})
      const accounting=calculateSessionAccounting(patient,true)
      Object.assign(patientUpdates, {
        completedSessions:accounting.completedSessions,remainingSessions:accounting.remainingSessions,administrative:{...currentPatientV2.administrative,completedSessions:accounting.completedSessions},
        status: accounting.remainingSessions > 0 ? 'active' : 'discharged',
      })
    }
    if (planSnapshot.exists() && payload.objectiveProgress?.length > 0) {
      const objectives = applyObjectiveProgress(planSnapshot.data().objectives, payload.objectiveProgress)
      transaction.update(planRef, { objectives, updatedAt: serverTimestamp() })
      patientUpdates.therapeuticAchievedCount = objectives.filter((objective) => objective.status === 'Atingido').length
    }
    transaction.update(patientRef, parsePatientForUpdate(patientUpdates,convertPatientV1ToV2(patientSnapshot.data()),candidate.professionalId,timestamp))
  })

  await recordAuditEvent({ action: 'evolution.created', patientId, resourceId: evolutionRef.id, changedFields: Object.keys(payload) })

  return evolutionRef.id
}
