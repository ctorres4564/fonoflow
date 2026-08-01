import { describe, expect, it } from 'vitest'
import { convertPatientV1ToV2 } from '../mappers/patient.mapper'
import { convertAppointmentV1ToV2 } from '../mappers/appointment.mapper'
import { parseAppointmentForCreate, parseAppointmentForUpdate, parseEvolutionAmendmentCreate, parseEvolutionDraftCreate, parseEvolutionDraftUpdate, parseEvolutionFinalize, parseEvolutionVoid, parsePatientForCreate, parsePatientForUpdate } from './persistence.parsers'

describe('parsers de persistÃªncia V2', () => {
  it('impÃµe identidade autenticada ao criar paciente', () => {
    const value=parsePatientForCreate(convertPatientV1ToV2({userId:'forjado',name:'Teste',createdAt:new Date(),createdBy:'forjado'}),'autenticado',new Date())
    expect(value.userId).toBe('autenticado'); expect(value.createdBy).toBe('autenticado')
  })
  it('preserva campos imutÃ¡veis ao atualizar paciente', () => {
    const current=convertPatientV1ToV2({userId:'dono',name:'Antes',createdAt:new Date(),createdBy:'criador'})
    const value=parsePatientForUpdate({userId:'outro',createdBy:'outro',personalData:{...current.personalData,fullName:'Depois'}},current,'dono',new Date())
    expect(value.userId).toBe('dono'); expect(value.createdBy).toBe('criador'); expect(value.personalData.fullName).toBe('Depois')
  })
  it('valida horÃ¡rios e preserva paciente na agenda', () => {
    const current=convertAppointmentV1ToV2({userId:'u',patientId:'p',date:'2026-08-01',startTime:'09:00',endTime:'10:00',createdAt:new Date()})
    expect(()=>parseAppointmentForCreate({...current,scheduledEnd:new Date('2026-08-01T08:00:00')},'u',new Date())).toThrow()
    expect(parseAppointmentForUpdate({patientId:'outro',notes:'ok'},current,new Date()).patientId).toBe('p')
  })
})
describe('parsers de escrita de evoluÃ§Ã£o',()=>{
  it('aceita rascunho e protege profissional/paciente na ediÃ§Ã£o',()=>{const current=parseEvolutionDraftCreate({date:'2026-07-01',duration:30,notes:''},'p','u',new Date());expect(current.status).toBe('draft');expect(()=>parseEvolutionDraftUpdate({patientId:'outro'},current,'u',new Date())).toThrow();expect(()=>parseEvolutionDraftUpdate({},current,'outro',new Date())).toThrow()})
  it('exige texto simples na finalizaÃ§Ã£o',()=>{const base={serviceDate:'2026-07-01',durationMinutes:30,structuredContent:{sessionObjectives:[],procedures:[],clinicalFindings:null,patientResponse:null,performanceSummary:null,incidents:null,familyGuidance:null,nextSessionPlan:null},richText:{plainText:''}};expect(()=>parseEvolutionFinalize(base,'p','u',new Date())).toThrow()})
  it('exige motivo de anulaÃ§Ã£o e torna adendo estrito',()=>{expect(()=>parseEvolutionVoid('', 'u',new Date())).toThrow();expect(parseEvolutionVoid('Duplicidade','u',new Date()).status).toBe('voided');expect(()=>parseEvolutionAmendmentCreate({plainText:'',extra:true},'u',new Date())).toThrow()})
})
