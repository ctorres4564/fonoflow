import { renderToStaticMarkup } from 'react-dom/server'
import { describe,expect,it } from 'vitest'
import { ClinicalAlerts } from './PatientTable'
import PatientFormModal from './PatientFormModal'
import { normalizeAppointmentDocument } from '../../mappers/appointment.mapper'
import { normalizePatientDocument } from '../../mappers/patient.mapper'

describe('interface Schema V2',()=>{
  it('renderiza as nove seções e normaliza pacientes V1/V2',()=>{const html=renderToStaticMarkup(<PatientFormModal isOpen onClose={()=>{}} onSubmit={()=>{}}/>);for(let section=1;section<=9;section+=1)expect(html).toContain(`${section}.`);expect(normalizePatientDocument({userId:'u',name:'Legado',createdAt:new Date()}).name).toBe('Legado');expect(normalizePatientDocument({schemaVersion:2,userId:'u',personalData:{fullName:'V2'},contact:{},address:{},clinicalProfile:{},clinicalAlerts:{},homeCare:{enabled:false,serviceAddressSameAsPatientAddress:true},administrative:{serviceType:'private'},status:'active',createdAt:new Date(),createdBy:'u'}).name).toBe('V2')})
  it('omite alertas ausentes e mostra múltiplos alertas com texto',()=>{expect(renderToStaticMarkup(<ClinicalAlerts/>)).toBe('');const html=renderToStaticMarkup(<ClinicalAlerts alerts={{allergies:['Látex'],aspirationRisk:true,medications:[]}}/>);expect(html).toContain('Alerta clínico');expect(html).toContain('Látex');expect(html).toContain('Risco de aspiração');expect(html).toContain('role="alert"')})
  it('agenda apresenta documentos V1 e V2 pelo mesmo mapper',()=>{const legacy=normalizeAppointmentDocument({userId:'u',patientId:'p',date:'2026-08-01',startTime:'09:00',endTime:'10:00',status:'Realizado',createdAt:new Date()});const v2=normalizeAppointmentDocument({schemaVersion:2,userId:'u',patientId:'p',serviceType:'clinic',scheduledStart:new Date('2026-08-01T09:00:00'),scheduledEnd:new Date('2026-08-01T10:00:00'),status:'completed',sessionAccounting:{deductSession:true},createdAt:new Date(),createdBy:'u'});expect(legacy.status).toBe('Realizado');expect(v2.status).toBe('Realizado');expect(v2.appointmentStatusV2).toBe('completed')})
})
