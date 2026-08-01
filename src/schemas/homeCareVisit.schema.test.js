import { describe, expect, it } from 'vitest'
import { createHomeCareAddressSnapshot, homeCareVisitSchema, parseHomeCareVisitCreate, parseHomeCareTravelUpdate } from './homeCareVisit.schema'

const visit = () => ({ schemaVersion:1, appointmentId:'a', patientId:'p', professionalId:'u', userId:'u', status:'planned',
  location:{addressSnapshot:{postalCode:null,street:'Rua A',number:'1',complement:null,district:null,city:'São Paulo',state:'SP',referencePoint:null},accessInstructionsSnapshot:null},
  schedule:{scheduledStart:new Date(),scheduledEnd:new Date()}, travel:{departureAt:null,arrivalAt:null,estimatedDistanceKm:null,actualDistanceKm:null,travelDurationMinutes:null,transportationMode:null},
  service:{startedAt:null,endedAt:null,durationMinutes:null,caregiverPresent:null,caregiverName:null}, occurrence:{type:'none',description:null}, createdAt:new Date(),createdBy:'u',updatedAt:null,updatedBy:null })

describe('schema operacional home care', () => {
  it('aceita criação válida e autentica o proprietário', () => expect(parseHomeCareVisitCreate(visit(), 'u').status).toBe('planned'))
  it('rejeita status, distância e ocorrência inválidos', () => {
    expect(homeCareVisitSchema.safeParse({...visit(),status:'unknown'}).success).toBe(false)
    expect(homeCareVisitSchema.safeParse({...visit(),travel:{...visit().travel,actualDistanceKm:-1}}).success).toBe(false)
    expect(homeCareVisitSchema.safeParse({...visit(),occurrence:{type:'safety_risk',description:null}}).success).toBe(false)
  })
  it('rejeita campo imutável alterado', () => expect(() => parseHomeCareTravelUpdate({...visit(),patientId:'outro'}, visit(), 'u')).toThrow(/imutável/))
  it('prioriza endereço alternativo no snapshot', () => expect(createHomeCareAddressSnapshot({address:{street:'Principal'},homeCare:{serviceAddressSameAsPatientAddress:false,serviceAddress:{street:'Alternativo'}}}).street).toBe('Alternativo'))
})
