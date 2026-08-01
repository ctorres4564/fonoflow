const allowedOrigins = new Set([
  'https://fonoflow.vercel.app',
  'http://localhost:3000',
  'http://localhost:4173',
  'http://localhost:5173',
])

const bearerToken = (value) =>
  typeof value === 'string' ? value.match(/^Bearer\s+(\S+)$/)?.[1] : null

function httpStatus(error) {
  return {
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    FILE_BLOCKED: 422,
    INTERNAL: 500,
  }[error?.code] || 400
}

export function createDocumentStorageHandler({
  authenticate,
  repository,
  operation,
  scanner = null,
  method = 'POST',
  successStatus = 200,
}) {
  return async (request, response) => {
    const origin = request.headers?.origin
    const allowedOrigin = !origin || allowedOrigins.has(origin)
    response.setHeader('Vary', 'Origin')
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('Access-Control-Allow-Methods', `${method},OPTIONS`)
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    if (origin && allowedOrigin) response.setHeader('Access-Control-Allow-Origin', origin)
    if (request.method === 'OPTIONS') return response.status(allowedOrigin ? 204 : 403).end()
    if (!allowedOrigin) {
      return response.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Origem não autorizada.' },
      })
    }
    if (request.method !== method) {
      return response.status(405).json({
        error: { code: 'METHOD_NOT_ALLOWED', message: 'Método não permitido.' },
      })
    }

    try {
      const token = bearerToken(request.headers?.authorization)
      if (!token) {
        return response.status(401).json({
          error: { code: 'UNAUTHENTICATED', message: 'Sessão inválida.' },
        })
      }
      const identity = await authenticate(token)
      const payload = method === 'GET' ? request.query : request.body
      const result = await operation({
        uid: identity.uid,
        payload,
        patientId: payload?.patientId,
        documentId: request.query?.documentId,
        repository,
        scanner,
      })
      return response.status(result.replayed ? 200 : successStatus).json(result)
    } catch (error) {
      const code =
        error?.message === 'unauthenticated'
          ? 'UNAUTHENTICATED'
          : error?.code || 'INVALID_REQUEST'
      const status = code === 'UNAUTHENTICATED' ? 401 : httpStatus(error)
      if (status === 500) {
        console.error('Document storage operation failed:', error?.code || error?.name)
      }
      return response.status(status).json({
        error: {
          code,
          message: status === 400 ? 'Solicitação documental inválida.' : error.message,
        },
      })
    }
  }
}
