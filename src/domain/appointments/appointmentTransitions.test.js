import { describe,expect,it } from 'vitest'
import { allowedTransitions,assertAppointmentTransition,calculateSessionAccounting,canTransitionAppointment } from './appointmentTransitions'

describe('matriz de transiÃ§Ãµes da agenda',()=>{
  it('aceita todas as arestas declaradas',()=>Object.entries(allowedTransitions).forEach(([from,targets])=>targets.forEach(to=>expect(canTransitionAppointment(from,to)).toBe(true))))
  it('rejeita reabertura e repetiÃ§Ã£o de concluÃ­do',()=>{expect(canTransitionAppointment('completed','scheduled')).toBe(false);expect(()=>assertAppointmentTransition('Realizado','Realizado')).toThrow()})
  it('normaliza status legado',()=>expect(assertAppointmentTransition('Agendado','Confirmado')).toBe('confirmed'))
  it('debita uma vez, respeita zero e o limite contratado',()=>{expect(calculateSessionAccounting({totalSessions:2,completedSessions:1},true)).toMatchObject({completedSessions:2,remainingSessions:0});expect(calculateSessionAccounting({totalSessions:2,completedSessions:0},false).remainingSessions).toBe(2);expect(()=>calculateSessionAccounting({totalSessions:2,completedSessions:2},true)).toThrow()})
})
