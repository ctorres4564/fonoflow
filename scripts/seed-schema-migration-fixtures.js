import process from 'node:process'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Seed bloqueado: configure FIRESTORE_EMULATOR_HOST e use exclusivamente o emulador.')
if (!getApps().length) initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-fonoflow' })
const db = getFirestore()
const now = new Date('2026-07-15T12:00:00Z')
const batch = db.batch()
const put = (path, value) => batch.set(db.doc(path), value)

for (let i=1;i<=3;i+=1) put(`patients/v1-patient-${i}`, { userId:'fixture-user', name:`Paciente Legado ${i}`, phone:`1190000000${i}`, address:'Rua FictÃ­cia, 10', totalSessions:10, completedSessions:i, status:'Ativo', ...(i===1?{homeCare:{enabled:true}}:{}), createdAt:now, createdBy:'fixture-user' })
for (let i=1;i<=3;i+=1) put(`patients/v2-patient-${i}`, { schemaVersion:2, userId:'fixture-user', personalData:{fullName:`Paciente V2 ${i}`,birthDate:null}, contact:{phone:`1191000000${i}`}, address:{street:'Avenida de Teste'}, ...(i===1?{legalRepresentative:{name:'ResponsÃ¡vel FictÃ­cio'}}:{}), clinicalProfile:{diagnosis:null,diagnosticHypothesis:null,cidCodes:[],cifCodes:[],referralSource:null,mainComplaint:null,generalObservations:null}, clinicalAlerts:{allergies:i===2?['LÃ¡tex']:[],medications:[],aspirationRisk:i===2,tracheostomy:false,gastrostomy:false,oxygenUse:false,epilepsy:false,dietaryRestrictions:[],mobilityRestrictions:[],otherAlerts:[]}, homeCare:{enabled:i===3,serviceAddressSameAsPatientAddress:true}, administrative:{serviceType:'private',contractedSessions:12,completedSessions:i}, status:'active', search:{normalizedName:`paciente v2 ${i}`,normalizedPhone:`1191000000${i}`}, createdAt:now,createdBy:'fixture-user' })
for (let i=1;i<=3;i+=1) put(`patients/v1-patient-1/evolutions/v1-evolution-${i}`, { patientId:'v1-patient-1',authorId:'fixture-user',date:`2026-07-0${i}`,duration:45,notes:`EvoluÃ§Ã£o fictÃ­cia ${i}`,createdAt:now, ...(i===2?{voided:true,voidReason:'Registro duplicado de teste'}:{}) })
for (let i=1;i<=3;i+=1) put(`patients/v2-patient-1/evolutions/v2-evolution-${i}`, { schemaVersion:2,patientId:'v2-patient-1',professionalId:'fixture-user',serviceDate:`2026-07-1${i}`,durationMinutes:50,structuredContent:{sessionObjectives:[],procedures:[],clinicalFindings:null,patientResponse:null,performanceSummary:null,incidents:null,familyGuidance:null,nextSessionPlan:null},richText:{html:null,json:null,plainText:`ConteÃºdo fictÃ­cio ${i}`},status:i===1?'finalized':'draft',finalizedAt:i===1?now:null,finalizedBy:i===1?'fixture-user':null,createdAt:now,createdBy:'fixture-user' })
put('patients/v2-patient-1/evolutions/v2-evolution-1/amendments/amendment-1',{content:null,plainText:'Adendo fictÃ­cio imutÃ¡vel',authorId:'fixture-user',createdAt:now})
const legacyStatuses=['Agendado','Confirmado','Falta','Cancelado pelo paciente','Reagendado']
for(let i=1;i<=5;i+=1) put(`schedules/v1-schedule-${i}`,{userId:'fixture-user',patientId:'v1-patient-1',patientName:'Paciente Legado 1',date:`2026-08-0${i}`,startTime:'09:00',endTime:'09:50',status:legacyStatuses[i-1],createdAt:now})
const statuses=['scheduled','confirmed','in_transit','arrived','completed']
for(let i=1;i<=5;i+=1) put(`schedules/v2-schedule-${i}`,{schemaVersion:2,userId:'fixture-user',patientId:'v2-patient-1',patientName:'Paciente V2 1',serviceType:'clinic',scheduledStart:new Date(`2026-08-${String(i+10).padStart(2,'0')}T09:00:00Z`),scheduledEnd:new Date(`2026-08-${String(i+10).padStart(2,'0')}T09:50:00Z`),status:statuses[i-1],sessionAccounting:{deductSession:i===5,deductedAt:i===5?now:null,deductionOperationId:i===5?'fixture-operation':null},notes:null,createdAt:now,createdBy:'fixture-user'})
await batch.commit()
console.log(JSON.stringify({patients:6,evolutions:6,amendments:1,appointments:10,environment:'emulator'}))
