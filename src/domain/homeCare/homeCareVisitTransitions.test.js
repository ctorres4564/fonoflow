import { describe, expect, it } from 'vitest'
import { assertHomeCareVisitTransition, canTransitionHomeCareVisit, getHomeCareNextActions } from './homeCareVisitTransitions'

describe('transições da visita home care', () => {
  it('aceita o fluxo operacional completo', () => {
    expect(canTransitionHomeCareVisit('planned', 'in_transit')).toBe(true)
    expect(canTransitionHomeCareVisit('in_transit', 'arrived')).toBe(true)
    expect(canTransitionHomeCareVisit('arrived', 'in_service')).toBe(true)
    expect(canTransitionHomeCareVisit('in_service', 'completed')).toBe(true)
  })
  it('bloqueia início, conclusão duplicada e alteração terminal inválidos', () => {
    expect(() => assertHomeCareVisitTransition('planned', 'in_service')).toThrow()
    expect(() => assertHomeCareVisitTransition('arrived', 'completed')).toThrow()
    expect(() => assertHomeCareVisitTransition('completed', 'completed')).toThrow()
  })
  it('oferece falta e cancelamento apenas nos estados permitidos', () => {
    expect(getHomeCareNextActions('planned').map((item) => item.targetStatus)).toEqual(['in_transit', 'patient_absent', 'cancelled'])
    expect(canTransitionHomeCareVisit('arrived', 'patient_absent')).toBe(true)
    expect(canTransitionHomeCareVisit('in_transit', 'cancelled')).toBe(true)
  })
})
