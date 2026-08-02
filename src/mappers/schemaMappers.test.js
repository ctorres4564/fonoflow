import { describe, expect, it } from 'vitest'
import { patientV2Schema } from '../schemas/patient.schema'
import { evolutionV2Schema } from '../schemas/evolution.schema'
import { appointmentV2Schema } from '../schemas/appointment.schema'
import { convertPatientV1ToV2, normalizePatientDocument, normalizeSearchPhone, normalizeSearchText } from './patient.mapper'
import { normalizeEvolutionDocument } from './evolution.mapper'
import { normalizeAppointmentDocument } from './appointment.mapper'

const patient = () => convertPatientV1ToV2({ userId:'u1', name:'Maria', phone:'(11) 99999-0000', totalSessions:10, completedSessions:2, createdAt:new Date(), createdBy:'u1' })
describe('schema de pacientes', () => {
  it('aceita V2 e campos opcionais ausentes', () => expect(patientV2Schema.safeParse(patient()).success).toBe(true))
  it('rejeita nome e userId ausentes', () => { expect(patientV2Schema.safeParse({...patient(), personalData:{fullName:''}}).success).toBe(false); expect(patientV2Schema.safeParse({...patient(), userId:''}).success).toBe(false) })
  it('valida CPF, email e números não negativos', () => { expect(patientV2Schema.safeParse({...patient(), personalData:{...patient().personalData,cpf:'52998224725'}}).success).toBe(true); expect(patientV2Schema.safeParse({...patient(), personalData:{...patient().personalData,cpf:'11111111111'}}).success).toBe(false); expect(patientV2Schema.safeParse({...patient(),contact:{email:'x'}}).success).toBe(false); expect(patientV2Schema.safeParse({...patient(),administrative:{serviceType:'private',sessionValue:-1}}).success).toBe(false) })
  it('normaliza legado sem mutar e cria índice determinístico', () => { const raw={userId:'u1',name:'  João  da Silva ',createdAt:new Date()}; const copy={...raw}; expect(normalizePatientDocument(raw).name).toContain('João'); expect(raw).toEqual(copy); expect(normalizeSearchText('  ÁLVARO   Lima ')).toBe('alvaro lima'); expect(normalizeSearchPhone('(11) 9-99')).toBe('11999') })
  it('suporta home care e endereço alternativo', () => expect(patientV2Schema.safeParse({...patient(),homeCare:{enabled:true,serviceAddressSameAsPatientAddress:false,serviceAddress:{state:'SP'}}}).success).toBe(true))
})
describe('schema de evoluções', () => {
  it('normaliza documento antigo', () => expect(normalizeEvolutionDocument({patientId:'p',authorId:'u',date:'2026-07-01',notes:'texto',createdAt:new Date()}).richText.plainText).toBe('texto'))
  it('valida duração, texto, status e motivo de anulação', () => { const base=normalizeEvolutionDocument({patientId:'p',authorId:'u',date:'2026-07-01',notes:'texto',createdAt:new Date()}); expect(evolutionV2Schema.safeParse({...base,durationMinutes:-1}).success).toBe(false); expect(evolutionV2Schema.safeParse({...base,richText:{plainText:''}}).success).toBe(false); expect(evolutionV2Schema.safeParse({...base,status:'bad'}).success).toBe(false); expect(evolutionV2Schema.safeParse({...base,status:'voided',voided:true,voidReason:null}).success).toBe(false); expect(evolutionV2Schema.safeParse({...base,status:'voided',voided:true,voidReason:'erro'}).success).toBe(true) })
})
describe('schema de agenda', () => {
  it('normaliza legado e débito', () => { const value=normalizeAppointmentDocument({userId:'u',patientId:'p',date:'2026-07-01',startTime:'10:00',endTime:'11:00',status:'Realizado',sessionDeducted:true,createdAt:new Date()}); expect(value.status).toBe('Realizado'); expect(value.sessionAccounting.deductSession).toBe(true) })
  it('rejeita status e intervalo inválidos', () => { const base={schemaVersion:2,userId:'u',patientId:'p',serviceType:'clinic',scheduledStart:new Date('2026-01-01T11:00:00'),scheduledEnd:new Date('2026-01-01T10:00:00'),status:'scheduled',sessionAccounting:{deductSession:false},createdAt:new Date(),createdBy:'u'}; expect(appointmentV2Schema.safeParse(base).success).toBe(false); expect(appointmentV2Schema.safeParse({...base,scheduledEnd:new Date('2026-01-01T12:00:00'),status:'bad'}).success).toBe(false) })
})
