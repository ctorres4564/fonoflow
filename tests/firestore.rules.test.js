import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { readFileSync } from 'node:fs'

const projectId = 'demo-fonoflow'
let testEnv

function firestoreFor(uid) {
  return testEnv.authenticatedContext(uid, { email: `${uid}@example.com` }).firestore()
}

async function seed(path, data) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), data)
  })
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
    },
  })
})

beforeEach(async () => {
  await testEnv.clearFirestore()
})

afterAll(async () => {
  await testEnv.cleanup()
})

describe('patients', () => {
  const patientV2 = (overrides = {}) => ({
    schemaVersion: 2, userId: 'professional-a', status: 'active',
    personalData: { fullName: 'Paciente V2' }, homeCare: { enabled: true },
    ...overrides,
  })

  it('aceita paciente V2 válido e rejeita campos críticos inválidos', async () => {
    const db = firestoreFor('professional-a')
    await assertSucceeds(setDoc(doc(db, 'patients', 'patient-v2'), patientV2()))
    await assertFails(setDoc(doc(db, 'patients', 'patient-invalid'), patientV2({ personalData: { fullName: '' } })))
    await assertFails(setDoc(doc(db, 'patients', 'patient-future'), patientV2({ schemaVersion: 3 })))
  })
  it('permite criar e ler o próprio paciente', async () => {
    const db = firestoreFor('professional-a')
    const patientRef = doc(db, 'patients', 'patient-a')

    await assertSucceeds(setDoc(patientRef, { name: 'Paciente A', userId: 'professional-a' }))
    await assertSucceeds(getDoc(patientRef))
  })

  it('impede acesso ao paciente de outro profissional', async () => {
    await seed('patients/patient-a', { name: 'Paciente A', userId: 'professional-a' })
    const otherDb = firestoreFor('professional-b')

    await assertFails(getDoc(doc(otherDb, 'patients', 'patient-a')))
    await assertFails(deleteDoc(doc(otherDb, 'patients', 'patient-a')))
  })

  it('impede trocar o proprietário de um paciente', async () => {
    await seed('patients/patient-a', { name: 'Paciente A', userId: 'professional-a' })
    const ownerDb = firestoreFor('professional-a')

    await assertFails(updateDoc(doc(ownerDb, 'patients', 'patient-a'), { userId: 'professional-b' }))
  })

  it('impede acesso sem autenticação', async () => {
    await seed('patients/patient-a', { name: 'Paciente A', userId: 'professional-a' })
    const anonymousDb = testEnv.unauthenticatedContext().firestore()

    await assertFails(getDoc(doc(anonymousDb, 'patients', 'patient-a')))
  })
})

describe('schedule V2', () => {
  it('aceita contrato válido e rejeita débito sem estrutura protegida', async () => {
    const db = firestoreFor('professional-a')
    const base = { schemaVersion:2,userId:'professional-a',patientId:'patient-a',serviceType:'home_care',status:'scheduled',sessionAccounting:{deductSession:false} }
    await assertSucceeds(setDoc(doc(db,'schedules','v2-ok'),base))
    await assertFails(setDoc(doc(db,'schedules','v2-invalid'),{...base,sessionAccounting:{deductSession:'yes'}}))
  })
})

describe('home care visit', () => {
  const schedule = { schemaVersion:2,userId:'professional-a',patientId:'patient-a',serviceType:'home_care',status:'scheduled',sessionAccounting:{deductSession:false} }
  const visit = (overrides={}) => ({ schemaVersion:1,appointmentId:'schedule-a',patientId:'patient-a',professionalId:'professional-a',userId:'professional-a',status:'planned',location:{addressSnapshot:{}},schedule:{scheduledStart:'start',scheduledEnd:'end'},travel:{},service:{},occurrence:{type:'none',description:null},createdAt:'now',createdBy:'professional-a',updatedAt:null,updatedBy:null,...overrides })
  beforeEach(async () => { await seed('schedules/schedule-a', schedule) })
  it('permite ao proprietário criar, ler e avançar a visita', async () => {
    const db=firestoreFor('professional-a'); const ref=doc(db,'schedules/schedule-a/homeCareVisit/current')
    await assertSucceeds(setDoc(ref,visit())); await assertSucceeds(getDoc(ref)); await assertSucceeds(updateDoc(ref,{status:'in_transit'}))
  })
  it('rejeita outro usuário e userId forjado', async () => {
    const other=firestoreFor('professional-b'); await assertFails(setDoc(doc(other,'schedules/schedule-a/homeCareVisit/current'),visit({userId:'professional-b',professionalId:'professional-b'})))
    const owner=firestoreFor('professional-a'); await assertFails(setDoc(doc(owner,'schedules/schedule-a/homeCareVisit/current'),visit({userId:'forged'})))
  })
  it('rejeita transição inválida, alteração terminal e exclusão', async () => {
    await seed('schedules/schedule-a/homeCareVisit/current',visit({status:'completed'})); const db=firestoreFor('professional-a'); const ref=doc(db,'schedules/schedule-a/homeCareVisit/current')
    await assertFails(updateDoc(ref,{status:'arrived'})); await assertFails(deleteDoc(ref))
  })
  it('protege identificadores e histórico operacional', async () => {
    await seed('schedules/schedule-a/homeCareVisit/current',visit()); const db=firestoreFor('professional-a'); const ref=doc(db,'schedules/schedule-a/homeCareVisit/current')
    await assertFails(updateDoc(ref,{patientId:'other'})); await assertFails(updateDoc(ref,{appointmentId:'other'}))
  })
})

describe('audit logs', () => {
  it('impede leitura, criação, alteração e exclusão pelo cliente', async () => {
    await seed('auditLogs/event-1', { actorId: 'professional-a', action: 'record.viewed' })
    const db = firestoreFor('professional-a')
    const eventRef = doc(db, 'auditLogs/event-1')

    await assertFails(getDoc(eventRef))
    await assertFails(setDoc(doc(db, 'auditLogs/event-2'), { actorId: 'professional-a' }))
    await assertFails(updateDoc(eventRef, { action: 'record.exported' }))
    await assertFails(deleteDoc(eventRef))
  })
})

describe('documents subcollection', () => {
  beforeEach(async () => {
    await seed('patients/patient-a', { name: 'Paciente A', userId: 'professional-a' })
    await seed('patients/patient-a/documents/doc-1', {
      schemaVersion: 2,
      ownerId: 'professional-a',
      status: 'available',
    })
    await seed('patients/patient-a/documents/doc-1/securityScans/scan-1', { status: 'clean' })
  })

  it('permite que o proprietário do paciente crie, leia e exclua documentos dele', async () => {
    const db = firestoreFor('professional-a')
    const docRef = doc(db, 'patients/patient-a/documents/doc-1')

    await assertSucceeds(getDoc(docRef))
    await assertFails(getDoc(doc(db, 'patients/patient-a/documents/doc-1/securityScans/scan-1')))
    await assertFails(setDoc(doc(db, 'patients/patient-a/documents/doc-2'), { ownerId: 'professional-a' }))
    await assertFails(updateDoc(docRef, { status: 'available' }))
    await assertFails(deleteDoc(docRef))
    await assertFails(setDoc(doc(db, 'patients/patient-a/documents/doc-1/securityScans/scan-2'), { status: 'clean' }))
  })

  it('impede que outro profissional leia ou escreva documentos no paciente', async () => {
    const db = firestoreFor('professional-b')
    const docRef = doc(db, 'patients/patient-a/documents/doc-1')

    await assertFails(setDoc(docRef, { name: 'laudo.pdf', url: 'https://example.com' }))
    await assertFails(getDoc(docRef))
  })

  it('impede que usuários anônimos leiam ou escrevam documentos', async () => {
    const anonymousDb = testEnv.unauthenticatedContext().firestore()
    const docRef = doc(anonymousDb, 'patients/patient-a/documents/doc-1')

    await assertFails(setDoc(docRef, { name: 'laudo.pdf', url: 'https://example.com' }))
    await assertFails(getDoc(docRef))
  })
})

describe('evolution immutability', () => {
  beforeEach(async () => {
    await seed('patients/patient-a', { name: 'Paciente A', userId: 'professional-a' })
  })

  it('permite ao proprietário criar e ler uma evolução', async () => {
    const db = firestoreFor('professional-a')
    const evolutionRef = doc(db, 'patients/patient-a/evolutions/evolution-1')

    await assertSucceeds(setDoc(evolutionRef, {
      date: '2026-07-16',
      duration: 50,
      notes: 'Texto simples',
      richContent: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Texto simples' }] }] },
      formatVersion: 1,
      authorId: 'professional-a',
    }))
    await assertSucceeds(getDoc(evolutionRef))
  })

  it('impede alterar o conteúdo original da evolução', async () => {
    await seed('patients/patient-a/evolutions/evolution-1', { date: '2026-07-16', notes: 'Texto original', authorId: 'professional-a' })
    const db = firestoreFor('professional-a')
    const evolutionRef = doc(db, 'patients/patient-a/evolutions/evolution-1')

    await assertFails(updateDoc(evolutionRef, { notes: 'Texto alterado' }))
    await assertFails(updateDoc(evolutionRef, { date: '2026-07-20' }))
  })

  it('impede excluir a evolução original', async () => {
    await seed('patients/patient-a/evolutions/evolution-1', { date: '2026-07-16', notes: 'Texto original' })
    const db = firestoreFor('professional-a')

    await assertFails(deleteDoc(doc(db, 'patients/patient-a/evolutions/evolution-1')))
  })

  it('impede outro profissional de ler ou escrever a evolução', async () => {
    await seed('patients/patient-a/evolutions/evolution-1', { date: '2026-07-16', notes: 'Texto original' })
    const otherDb = firestoreFor('professional-b')

    await assertFails(getDoc(doc(otherDb, 'patients/patient-a/evolutions/evolution-1')))
    await assertFails(setDoc(doc(otherDb, 'patients/patient-a/evolutions/evolution-2'), { date: '2026-07-16', notes: 'Acesso indevido' }))
  })

  it('impede acesso sem autenticação', async () => {
    await seed('patients/patient-a/evolutions/evolution-1', { date: '2026-07-16', notes: 'Texto original' })
    const anonymousDb = testEnv.unauthenticatedContext().firestore()

    await assertFails(getDoc(doc(anonymousDb, 'patients/patient-a/evolutions/evolution-1')))
    await assertFails(setDoc(doc(anonymousDb, 'patients/patient-a/evolutions/evolution-2'), { date: '2026-07-16', notes: 'x' }))
  })
})

describe('evolution amendments', () => {
  beforeEach(async () => {
    await seed('patients/patient-a', { name: 'Paciente A', userId: 'professional-a' })
    await seed('patients/patient-a/evolutions/evolution-1', { date: '2026-07-16', notes: 'Versão original', authorId: 'professional-a' })
  })

  it('permite ao proprietário criar e ler retificações imutáveis, sem poder editá-las ou excluí-las', async () => {
    const db = firestoreFor('professional-a')
    const amendmentRef = doc(db, 'patients/patient-a/evolutions/evolution-1/amendments/amendment-1')

    await assertSucceeds(setDoc(amendmentRef, {
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Complemento' }] }] },
      plainText: 'Complemento',
      authorId: 'professional-a',
    }))
    await assertSucceeds(getDoc(amendmentRef))
    await assertFails(updateDoc(amendmentRef, { plainText: 'Tentativa de alteração' }))
    await assertFails(deleteDoc(amendmentRef))
  })

  it('impede outro profissional de ler ou criar retificações', async () => {
    const db = firestoreFor('professional-b')
    const amendmentRef = doc(db, 'patients/patient-a/evolutions/evolution-1/amendments/amendment-1')

    await assertFails(setDoc(amendmentRef, { plainText: 'Acesso indevido' }))
    await assertFails(getDoc(amendmentRef))
  })

  it('impede acesso sem autenticação', async () => {
    const anonymousDb = testEnv.unauthenticatedContext().firestore()
    const amendmentRef = doc(anonymousDb, 'patients/patient-a/evolutions/evolution-1/amendments/amendment-1')

    await assertFails(setDoc(amendmentRef, { plainText: 'x' }))
    await assertFails(getDoc(amendmentRef))
  })
})

describe('evolution annulment', () => {
  beforeEach(async () => {
    await seed('patients/patient-a', { name: 'Paciente A', userId: 'professional-a' })
    await seed('patients/patient-a/evolutions/evolution-1', { date: '2026-07-16', notes: 'Versão original', authorId: 'professional-a' })
  })

  it('permite ao proprietário anular mediante justificativa, sem alterar o conteúdo original', async () => {
    const db = firestoreFor('professional-a')
    const evolutionRef = doc(db, 'patients/patient-a/evolutions/evolution-1')

    await assertSucceeds(updateDoc(evolutionRef, {
      status: 'voided',
      voided: true,
      voidedAt: '2026-07-20T00:00:00.000Z',
      voidedBy: 'professional-a',
      voidReason: 'Registro duplicado por engano.',
    }))
    const snapshot = await getDoc(evolutionRef)
    expect(snapshot.data().notes).toBe('Versão original')
  })

  it('impede anular sem justificativa', async () => {
    const db = firestoreFor('professional-a')
    const evolutionRef = doc(db, 'patients/patient-a/evolutions/evolution-1')

    await assertFails(updateDoc(evolutionRef, {
      voided: true,
      voidedAt: '2026-07-20T00:00:00.000Z',
      voidedBy: 'professional-a',
      voidReason: '',
    }))
  })

  it('impede alterar o conteúdo original junto com a anulação', async () => {
    const db = firestoreFor('professional-a')
    const evolutionRef = doc(db, 'patients/patient-a/evolutions/evolution-1')

    await assertFails(updateDoc(evolutionRef, {
      voided: true,
      voidedAt: '2026-07-20T00:00:00.000Z',
      voidedBy: 'professional-a',
      voidReason: 'Tentando também mudar o texto.',
      notes: 'Texto alterado',
    }))
  })

  it('impede anular duas vezes ou reverter uma anulação existente', async () => {
    await seed('patients/patient-a/evolutions/evolution-2', {
      date: '2026-07-16',
      notes: 'Já anulada',
      authorId: 'professional-a',
      voided: true,
      voidedAt: '2026-07-18T00:00:00.000Z',
      voidedBy: 'professional-a',
      voidReason: 'Primeira anulação',
    })
    const db = firestoreFor('professional-a')
    const evolutionRef = doc(db, 'patients/patient-a/evolutions/evolution-2')

    await assertFails(updateDoc(evolutionRef, { voidReason: 'Segunda tentativa' }))
    await assertFails(updateDoc(evolutionRef, { voided: false }))
  })

  it('impede outro profissional de anular a evolução', async () => {
    const otherDb = firestoreFor('professional-b')
    const evolutionRef = doc(otherDb, 'patients/patient-a/evolutions/evolution-1')

    await assertFails(updateDoc(evolutionRef, {
      voided: true,
      voidedAt: '2026-07-20T00:00:00.000Z',
      voidedBy: 'professional-b',
      voidReason: 'Tentativa indevida',
    }))
  })
})

describe('progress analyses', () => {
  beforeEach(async () => {
    await seed('patients/patient-a', { name: 'Paciente A', userId: 'professional-a' })
  })

  it('permite ao proprietário salvar e editar pareceres do paciente', async () => {
    const db = firestoreFor('professional-a')
    const analysisRef = doc(db, 'patients/patient-a/progressAnalyses/analysis-1')
    await assertSucceeds(setDoc(analysisRef, { text: 'Parecer revisado' }))
    await assertSucceeds(updateDoc(analysisRef, { text: 'Parecer atualizado' }))
    await assertSucceeds(getDoc(analysisRef))
  })

  it('impede outro profissional de acessar os pareceres', async () => {
    const db = firestoreFor('professional-b')
    const analysisRef = doc(db, 'patients/patient-a/progressAnalyses/analysis-1')
    await assertFails(setDoc(analysisRef, { text: 'Acesso indevido' }))
    await assertFails(getDoc(analysisRef))
  })
})

describe('evolution drafts', () => {
  beforeEach(async () => {
    await seed('patients/patient-a', { name: 'Paciente A', userId: 'professional-a' })
  })

  it('permite ao proprietário salvar e editar rascunhos de evolução', async () => {
    const db = firestoreFor('professional-a')
    const draftRef = doc(db, 'patients/patient-a/evolutionDrafts/draft-1')
    await assertSucceeds(setDoc(draftRef, { notes: 'Evolução em revisão' }))
    await assertSucceeds(updateDoc(draftRef, { notes: 'Evolução revisada' }))
    await assertSucceeds(getDoc(draftRef))
  })

  it('impede outro profissional de acessar rascunhos de evolução', async () => {
    const db = firestoreFor('professional-b')
    const draftRef = doc(db, 'patients/patient-a/evolutionDrafts/draft-1')
    await assertFails(setDoc(draftRef, { notes: 'Acesso indevido' }))
    await assertFails(getDoc(draftRef))
  })
})

describe('therapeutic plans', () => {
  beforeEach(async () => {
    await seed('patients/patient-a', { name: 'Paciente A', userId: 'professional-a' })
  })

  it('permite ao proprietário criar, editar e consultar o plano terapêutico', async () => {
    const db = firestoreFor('professional-a')
    const planRef = doc(db, 'patients/patient-a/therapeuticPlan/current')

    await assertSucceeds(setDoc(planRef, { status: 'Ativo', objectives: [] }))
    await assertSucceeds(updateDoc(planRef, { generalObjective: 'Ampliar comunicação funcional' }))
    await assertSucceeds(getDoc(planRef))
  })

  it('impede outro profissional de acessar o plano terapêutico', async () => {
    const db = firestoreFor('professional-b')
    const planRef = doc(db, 'patients/patient-a/therapeuticPlan/current')

    await assertFails(setDoc(planRef, { status: 'Ativo', objectives: [] }))
    await assertFails(getDoc(planRef))
  })
})

describe('schedule status history', () => {
  beforeEach(async () => {
    await seed('schedules/schedule-1', { patientId: 'patient-a', userId: 'professional-a', status: 'Agendado' })
  })

  it('permite ao proprietário criar e ler eventos imutáveis de status', async () => {
    const db = firestoreFor('professional-a')
    const historyRef = doc(db, 'schedules/schedule-1/statusHistory/history-1')
    await assertSucceeds(setDoc(historyRef, { previousStatus: 'scheduled', status: 'confirmed', actorId: 'professional-a', operationId: 'history-1' }))
    await assertSucceeds(getDoc(historyRef))
    await assertFails(updateDoc(historyRef, { status: 'Falta' }))
    await assertFails(deleteDoc(historyRef))
  })

  it('impede outro profissional de acessar o histórico de status', async () => {
    const db = firestoreFor('professional-b')
    const historyRef = doc(db, 'schedules/schedule-1/statusHistory/history-1')
    await assertFails(setDoc(historyRef, { status: 'Confirmado' }))
    await assertFails(getDoc(historyRef))
  })
})

describe('users', () => {
  it('permite criar somente o próprio perfil no plano demo', async () => {
    const db = firestoreFor('professional-a')

    await assertSucceeds(setDoc(doc(db, 'users', 'professional-a'), {
      uid: 'professional-a',
      name: 'Profissional A',
      email: 'professional-a@example.com',
      plan: 'demo',
      createdAt: '2026-07-15T00:00:00.000Z',
    }))
  })

  it('impede criar perfil premium ou perfil de outro usuário', async () => {
    const db = firestoreFor('professional-a')
    const baseProfile = {
      uid: 'professional-a',
      name: 'Profissional A',
      email: 'professional-a@example.com',
      plan: 'premium',
      createdAt: '2026-07-15T00:00:00.000Z',
    }

    await assertFails(setDoc(doc(db, 'users', 'professional-a'), baseProfile))
    await assertFails(setDoc(doc(db, 'users', 'professional-b'), {
      ...baseProfile,
      uid: 'professional-b',
      plan: 'demo',
    }))
  })

  it('permite editar dados básicos, mas não o plano', async () => {
    await seed('users/professional-a', {
      uid: 'professional-a',
      name: 'Profissional A',
      email: 'professional-a@example.com',
      plan: 'demo',
      createdAt: '2026-07-15T00:00:00.000Z',
    })
    const db = firestoreFor('professional-a')
    const userRef = doc(db, 'users', 'professional-a')

    await assertSucceeds(updateDoc(userRef, { name: 'Novo nome' }))
    await assertFails(updateDoc(userRef, { plan: 'premium' }))
    await assertFails(deleteDoc(userRef))
  })

  it('impede ler o perfil de outro usuário', async () => {
    await seed('users/professional-a', { uid: 'professional-a', plan: 'demo' })
    const otherDb = firestoreFor('professional-b')

    await assertFails(getDoc(doc(otherDb, 'users', 'professional-a')))
  })

  it('impede autoativação da feature evolutionQualityReview no create', async () => {
    const db = firestoreFor('professional-a')
    await assertFails(setDoc(doc(db, 'users', 'professional-a'), {
      uid: 'professional-a',
      name: 'Profissional A',
      email: 'professional-a@example.com',
      plan: 'demo',
      createdAt: '2026-07-15T00:00:00.000Z',
      features: { evolutionQualityReview: true }
    }))
  })

  it('impede autoativação da feature evolutionQualityReview no update parcial', async () => {
    await seed('users/professional-a', {
      uid: 'professional-a',
      name: 'Profissional A',
      email: 'professional-a@example.com',
      plan: 'demo',
      createdAt: '2026-07-15T00:00:00.000Z',
      features: { evolutionQualityReview: false }
    })
    const db = firestoreFor('professional-a')
    const userRef = doc(db, 'users', 'professional-a')
    await assertFails(updateDoc(userRef, { "features.evolutionQualityReview": true }))
  })

  it('impede autoativação da feature evolutionQualityReview ao substituir o objeto features', async () => {
    await seed('users/professional-a', {
      uid: 'professional-a',
      name: 'Profissional A',
      email: 'professional-a@example.com',
      plan: 'demo',
      createdAt: '2026-07-15T00:00:00.000Z',
      features: { evolutionQualityReview: false }
    })
    const db = firestoreFor('professional-a')
    const userRef = doc(db, 'users', 'professional-a')
    await assertFails(updateDoc(userRef, { features: { evolutionQualityReview: true } }))
  })

  it('permite atualizar outros campos de features sem alterar a flag protegida', async () => {
    await seed('users/professional-a', {
      uid: 'professional-a',
      name: 'Profissional A',
      email: 'professional-a@example.com',
      plan: 'demo',
      createdAt: '2026-07-15T00:00:00.000Z',
      features: { evolutionQualityReview: false, otherFeature: true }
    })
    const db = firestoreFor('professional-a')
    const userRef = doc(db, 'users', 'professional-a')
    await assertSucceeds(updateDoc(userRef, { "features.otherFeature": false }))
  })

  it('impede outro profissional de alterar features', async () => {
    await seed('users/professional-a', {
      uid: 'professional-a',
      name: 'Profissional A',
      email: 'professional-a@example.com',
      plan: 'demo',
      createdAt: '2026-07-15T00:00:00.000Z',
      features: { evolutionQualityReview: false }
    })
    const otherDb = firestoreFor('professional-b')
    const userRef = doc(otherDb, 'users', 'professional-a')
    await assertFails(updateDoc(userRef, { "features.evolutionQualityReview": true }))
  })

  it('impede desativação de true para false pelo cliente', async () => {
    await seed('users/professional-a', {
      uid: 'professional-a',
      name: 'Profissional A',
      email: 'professional-a@example.com',
      plan: 'demo',
      createdAt: '2026-07-15T00:00:00.000Z',
      features: { evolutionQualityReview: true }
    })
    const db = firestoreFor('professional-a')
    const userRef = doc(db, 'users', 'professional-a')
    await assertFails(updateDoc(userRef, { "features.evolutionQualityReview": false }))
  })

  it('impede desativação por substituição estrutural de true para false pelo cliente', async () => {
    await seed('users/professional-a', {
      uid: 'professional-a',
      name: 'Profissional A',
      email: 'professional-a@example.com',
      plan: 'demo',
      createdAt: '2026-07-15T00:00:00.000Z',
      features: { evolutionQualityReview: true }
    })
    const db = firestoreFor('professional-a')
    const userRef = doc(db, 'users', 'professional-a')
    await assertFails(updateDoc(userRef, { features: { evolutionQualityReview: false } }))
  })

  it('impede remoção do campo evolutionQualityReview pelo cliente', async () => {
    await seed('users/professional-a', {
      uid: 'professional-a',
      name: 'Profissional A',
      email: 'professional-a@example.com',
      plan: 'demo',
      createdAt: '2026-07-15T00:00:00.000Z',
      features: { evolutionQualityReview: true }
    })
    const db = firestoreFor('professional-a')
    const userRef = doc(db, 'users', 'professional-a')
    // Substituindo o objeto features por um sem a flag
    await assertFails(updateDoc(userRef, { features: { otherFeature: true } }))
  })

  it('impede remoção do objeto features inteiro pelo cliente', async () => {
    await seed('users/professional-a', {
      uid: 'professional-a',
      name: 'Profissional A',
      email: 'professional-a@example.com',
      plan: 'demo',
      createdAt: '2026-07-15T00:00:00.000Z',
      features: { evolutionQualityReview: true }
    })
    const db = firestoreFor('professional-a')
    const userRef = doc(db, 'users', 'professional-a')
    // Deletar o campo features inteiro
    await assertFails(updateDoc(userRef, { features: null }))
  })

  it('impede criar o perfil com features definido como false ou null e depois elevar para true', async () => {
    const db = firestoreFor('professional-a')
    const userRef = doc(db, 'users', 'professional-a')
    await assertSucceeds(setDoc(userRef, {
      uid: 'professional-a',
      name: 'Profissional A',
      email: 'professional-a@example.com',
      plan: 'demo',
      createdAt: '2026-07-15T00:00:00.000Z',
      features: { evolutionQualityReview: false }
    }))
    await assertFails(updateDoc(userRef, { "features.evolutionQualityReview": true }))
  })
})

describe('backend-only collections', () => {
  it('impede o cliente de ler ou escrever contadores de IA', async () => {
    const db = firestoreFor('professional-a')
    const usageRef = doc(db, 'aiUsage', 'professional-a_2026-07')

    await assertFails(getDoc(usageRef))
    await assertFails(setDoc(usageRef, { uid: 'professional-a', count: 0 }))
  })

  it('impede o cliente de escrever na coleção de idempotência', async () => {
    const db = firestoreFor('professional-a')
    const opRef = doc(db, 'evolutionFinalizeOperations', 'op-1')
    await assertFails(getDoc(opRef))
    await assertFails(setDoc(opRef, { uid: 'professional-a', status: 'created' }))
  })

  it('impede o cliente de escrever na coleção de rate limit', async () => {
    const db = firestoreFor('professional-a')
    const limitRef = doc(db, 'evolutionFinalizeRateLimits', 'limit-1')
    await assertFails(getDoc(limitRef))
    await assertFails(setDoc(limitRef, { uid: 'professional-a', count: 1 }))
  })

  it('impede o cliente de escrever ou apagar registros de quality reviews', async () => {
    const db = firestoreFor('professional-a')
    const reviewRef = doc(db, 'patients/patient-a/evolutions/evolution-1/qualityReviews/revision-1')
    await assertFails(setDoc(reviewRef, { finalAlerts: [] }))
    await assertFails(deleteDoc(reviewRef))
  })
})

describe('consentimentos LGPD', () => {
  beforeEach(async()=>{await seed('patients/patient-consent',{userId:'professional-a',name:'Paciente fictício'});await seed('patients/patient-consent/consents/consent-1',{schemaVersion:2,patientId:'patient-consent',userId:'professional-a',active:true,revoked:false})})
  it('permite leitura apenas pelo proprietário',async()=>{await assertSucceeds(getDoc(doc(firestoreFor('professional-a'),'patients/patient-consent/consents/consent-1')));await assertFails(getDoc(doc(firestoreFor('professional-b'),'patients/patient-consent/consents/consent-1')));await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(),'patients/patient-consent/consents/consent-1')))})
  it('bloqueia aceite, alteração, revogação e exclusão diretos pelo cliente',async()=>{const ref=doc(firestoreFor('professional-a'),'patients/patient-consent/consents/consent-1');await assertFails(setDoc(doc(firestoreFor('professional-a'),'patients/patient-consent/consents/consent-2'),{schemaVersion:2}));await assertFails(updateDoc(ref,{revoked:true,active:false}));await assertFails(deleteDoc(ref))})
  it('protege registros de idempotência',async()=>{const ref=doc(firestoreFor('professional-a'),'consentOperations/request-1');await assertFails(getDoc(ref));await assertFails(setDoc(ref,{uid:'professional-a'}))})
})

describe('clinical attachment references', () => {
  beforeEach(async () => {
    await seed('patients/attachment-patient', { userId: 'professional-a', name: 'Paciente ficticio' })
    await seed('patients/attachment-patient/evolutions/evolution-a', {
      patientId: 'attachment-patient', professionalId: 'professional-a', status: 'finalized',
    })
    await seed('patients/attachment-patient/evolutions/evolution-a/attachments/document-a', {
      documentId: 'document-a', patientId: 'attachment-patient', linkedBy: 'professional-a',
    })
    await seed('schedules/attachment-schedule', {
      patientId: 'attachment-patient', userId: 'professional-a', status: 'completed',
    })
    await seed('schedules/attachment-schedule/attachments/document-a', {
      documentId: 'document-a', patientId: 'attachment-patient', linkedBy: 'professional-a',
    })
    await seed('schedules/attachment-schedule/homeCareVisit/current', {
      patientId: 'attachment-patient', appointmentId: 'attachment-schedule', userId: 'professional-a',
    })
    await seed('schedules/attachment-schedule/homeCareVisit/current/attachments/document-a', {
      documentId: 'document-a', patientId: 'attachment-patient', linkedBy: 'professional-a',
    })
  })

  it('allows owner to read immutable evolution, appointment and home care references', async () => {
    const db = firestoreFor('professional-a')
    await assertSucceeds(getDoc(doc(db, 'patients/attachment-patient/evolutions/evolution-a/attachments/document-a')))
    await assertSucceeds(getDoc(doc(db, 'schedules/attachment-schedule/attachments/document-a')))
    await assertSucceeds(getDoc(doc(db, 'schedules/attachment-schedule/homeCareVisit/current/attachments/document-a')))
  })

  it('denies other users and all direct mutations', async () => {
    const foreignDb = firestoreFor('professional-b')
    const ownerDb = firestoreFor('professional-a')
    const evolutionRef = doc(ownerDb, 'patients/attachment-patient/evolutions/evolution-a/attachments/document-a')
    await assertFails(getDoc(doc(foreignDb, 'patients/attachment-patient/evolutions/evolution-a/attachments/document-a')))
    await assertFails(updateDoc(evolutionRef, { linkedBy: 'professional-b' }))
    await assertFails(deleteDoc(evolutionRef))
    await assertFails(setDoc(doc(ownerDb, 'schedules/attachment-schedule/attachments/document-b'), { documentId: 'document-b' }))
  })

  it('protects attachment idempotency records from clients', async () => {
    const db = firestoreFor('professional-a')
    const operationRef = doc(db, 'clinicalAttachmentOperations/request-a')
    await assertFails(getDoc(operationRef))
    await assertFails(setDoc(operationRef, { kind: 'archive' }))
  })
})

describe('document versioning, integrity and retention', () => {
  beforeEach(async () => {
    await seed('patients/version-patient', { userId: 'professional-a', name: 'Paciente fictício' })
    await seed('patients/version-patient/documents/document-a', {
      schemaVersion: 2, patientId: 'version-patient', ownerId: 'professional-a', status: 'available',
    })
    await seed('patients/version-patient/documents/document-a/versions/version-a', {
      schemaVersion: 2, patientId: 'version-patient', documentId: 'document-a',
      ownerId: 'professional-a', versionNumber: 1, status: 'current',
    })
    await seed('patients/version-patient/documents/document-a/versions/version-a/integrityChecks/check-a', {
      valid: true, checkedBy: 'professional-a',
    })
  })

  it('permite ao proprietário ler versões e verificações de integridade', async () => {
    const db = firestoreFor('professional-a')
    await assertSucceeds(getDoc(doc(db, 'patients/version-patient/documents/document-a/versions/version-a')))
    await assertSucceeds(getDoc(doc(db, 'patients/version-patient/documents/document-a/versions/version-a/integrityChecks/check-a')))
  })

  it('nega leitura por terceiro e qualquer mutação direta de versão', async () => {
    const versionRef = doc(firestoreFor('professional-a'), 'patients/version-patient/documents/document-a/versions/version-a')
    await assertFails(getDoc(doc(firestoreFor('professional-b'), 'patients/version-patient/documents/document-a/versions/version-a')))
    await assertFails(updateDoc(versionRef, { status: 'superseded' }))
    await assertFails(deleteDoc(versionRef))
    await assertFails(setDoc(doc(firestoreFor('professional-a'), 'patients/version-patient/documents/document-a/versions/version-b'), { status: 'draft' }))
  })

  it('protege operações idempotentes e políticas de retenção', async () => {
    const db = firestoreFor('professional-a')
    await assertFails(getDoc(doc(db, 'documentVersionOperations/request-a')))
    await assertFails(setDoc(doc(db, 'documentVersionOperations/request-a'), { kind: 'restore' }))
    await assertFails(getDoc(doc(db, 'retentionPolicies/clinical-ten-years')))
    await assertFails(setDoc(doc(db, 'retentionPolicies/clinical-ten-years'), { durationDays: 3650 }))
  })
})
