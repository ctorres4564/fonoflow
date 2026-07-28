import { auth } from '../firebase/config'

async function requestAudit(path = '', options = {}) {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('Usuário não autenticado.')
  const response = await fetch(`/api/audit${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...options.headers },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Não foi possível registrar a auditoria.')
  return data
}

export function recordAuditEvent(event) {
  return requestAudit('', { method: 'POST', body: JSON.stringify(event) })
}

export function getAuditEvents(limit = 100) {
  return requestAudit(`?limit=${limit}`, { method: 'GET' }).then((data) => data.events || [])
}
