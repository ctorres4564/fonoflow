import { auth } from '../firebase/config'

// Chamar a API segura de finalização de evoluções
export async function finalizeEvolutionWithQualityReview({ patientId, idempotencyKey, payload }) {
  const currentUser = auth.currentUser
  if (!currentUser) {
    const error = new Error('Usuário não autenticado.')
    error.code = 'UNAUTHENTICATED'
    throw error
  }

  // Obter token Firebase atualizado
  const token = await currentUser.getIdToken()

  // Determinar a base URL da API
  // No build do Vite/Vercel, as requests relativas ao mesmo domínio funcionam nativamente.
  // Para ambiente local e de teste, usamos origin/localhost.
  const baseUrl = import.meta.env.VITE_API_URL || ''
  
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'idempotency-key': idempotencyKey,
  }

  const response = await fetch(`${baseUrl}/api/evolutions/finalize`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      patientId,
      ...payload
    })
  })

  if (!response.ok) {
    let errBody
    try {
      errBody = await response.json()
    } catch (_) {
      // Ignorar falha no parse do corpo do erro
    }
    const errCode = errBody?.error?.code || 'INTERNAL_ERROR'
    const errMsg = errBody?.error?.message || 'Não foi possível processar a solicitação.'
    
    const error = new Error(errMsg)
    error.code = errCode
    error.status = response.status
    
    // Ler Retry-After se disponível
    const retryAfter = response.headers.get('Retry-After')
    if (retryAfter) {
      error.retryAfter = Number(retryAfter)
    }

    throw error
  }

  return response.json()
}
