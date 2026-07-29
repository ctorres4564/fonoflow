import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const DEMO_MONTHLY_LIMIT = 20
const PREMIUM_MONTHLY_LIMIT = Number(process.env.PREMIUM_AI_MONTHLY_LIMIT || 1000)
const PER_MINUTE_LIMIT = Number(process.env.AI_REQUESTS_PER_MINUTE || 10)

function configureCors(request, response) {
  const allowedOrigins = [
    'https://fonoflow.vercel.app',
    'http://localhost:3000',
    'http://localhost:5173',
  ]
  const origin = request.headers.origin

  if (origin && (allowedOrigins.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin))) {
    response.setHeader('Access-Control-Allow-Origin', origin)
  } else {
    response.setHeader('Access-Control-Allow-Origin', 'https://fonoflow.vercel.app')
  }

  response.setHeader('Access-Control-Allow-Credentials', true)
  response.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  response.setHeader(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type, X-Requested-With, Accept, X-Api-Version',
  )
}

function getFirebaseAdminApp() {
  if (getApps().length > 0) {
    return getApps()[0]
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Firebase Admin credentials are not configured')
  }

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  })
}

function extractBearerToken(request) {
  const authorization = request.headers.authorization

  if (!authorization || typeof authorization !== 'string') {
    return null
  }

  const [scheme, token, ...extraParts] = authorization.trim().split(/\s+/)
  if (scheme !== 'Bearer' || !token || extraParts.length > 0) {
    return null
  }

  return token
}

async function verifyFirebaseToken(request) {
  const token = extractBearerToken(request)
  if (!token) {
    return null
  }

  const app = getFirebaseAdminApp()
  return getAuth(app).verifyIdToken(token)
}

async function consumeAiQuota(app, uid) {
  const db = getFirestore(app)
  const now = new Date()
  const month = now.toISOString().slice(0, 7)
  const minute = now.toISOString().slice(0, 16).replace(/[:T]/g, '-')
  const userRef = db.collection('users').doc(uid)
  const monthlyRef = db.collection('aiUsage').doc(`${uid}_${month}`)
  const minuteRef = db.collection('aiRateLimits').doc(`${uid}_${minute}`)

  return db.runTransaction(async (transaction) => {
    const [userSnap, monthlySnap, minuteSnap] = await Promise.all([
      transaction.get(userRef),
      transaction.get(monthlyRef),
      transaction.get(minuteRef),
    ])

    const plan = String(userSnap.data()?.plan || 'demo').toLowerCase()
    const monthlyLimit = plan === 'premium' ? PREMIUM_MONTHLY_LIMIT : DEMO_MONTHLY_LIMIT
    const monthlyCount = Number(monthlySnap.data()?.count || 0)
    const minuteCount = Number(minuteSnap.data()?.count || 0)

    if (minuteCount >= PER_MINUTE_LIMIT) {
      return { allowed: false, status: 429, error: 'Muitas solicitações em pouco tempo. Aguarde um minuto.' }
    }
    if (monthlyCount >= monthlyLimit) {
      return { allowed: false, status: 429, error: `Cota mensal de IA do plano ${plan} excedida.` }
    }

    transaction.set(monthlyRef, {
      uid,
      month,
      plan,
      count: monthlyCount + 1,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    transaction.set(minuteRef, {
      uid,
      minute,
      count: minuteCount + 1,
      expiresAt: new Date(now.getTime() + 2 * 60 * 1000),
    }, { merge: true })

    return { allowed: true, plan, remaining: monthlyLimit - monthlyCount - 1 }
  })
}

export default async function handler(request, response) {
  configureCors(request, response)

  if (request.method === 'OPTIONS') {
    return response.status(200).end()
  }

  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' })
  }

  let decodedToken
  try {
    decodedToken = await verifyFirebaseToken(request)
  } catch (error) {
    console.error('Firebase token verification failed:', error?.code || error?.message || 'unknown_error')
    return response.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' })
  }

  if (!decodedToken?.uid) {
    return response.status(401).json({ error: 'Sessão ausente ou inválida. Faça login novamente.' })
  }

  const authenticatedUid = decodedToken.uid

  const { prompt, systemInstruction } = request.body

  if (!prompt || typeof prompt !== 'string') {
    return response.status(400).json({ error: 'Prompt is required and must be a string' })
  }

  if (prompt.length > 10000) {
    return response.status(400).json({ error: 'Prompt is too long (maximum 10,000 characters)' })
  }

  if (systemInstruction && (typeof systemInstruction !== 'string' || systemInstruction.length > 5000)) {
    return response.status(400).json({ error: 'System instruction is invalid or too long' })
  }

  let quota
  try {
    quota = await consumeAiQuota(getFirebaseAdminApp(), authenticatedUid)
  } catch (error) {
    console.error('AI quota validation failed:', error?.message || 'unknown_error')
    return response.status(503).json({ error: 'Não foi possível validar sua cota de IA.' })
  }

  if (!quota.allowed) {
    return response.status(quota.status).json({ error: quota.error })
  }

  // Chaves de API das opções (Prioriza Gemini API direta se configurada, senão usa OpenRouter/DeepSeek)
  const geminiApiKey = process.env.GEMINI_API_KEY
  const openRouterApiKey = process.env.OPENROUTER_API_KEY

  if (!geminiApiKey && !openRouterApiKey) {
    return response.status(500).json({ error: 'Serviço de IA indisponível no momento.' })
  }

  try {
    let resultText = ''

    if (openRouterApiKey) {
      // Provedor principal: DeepSeek via OpenRouter.
      const url = 'https://openrouter.ai/api/v1/chat/completions'

      const messages = []
      if (systemInstruction) {
        messages.push({ role: 'system', content: systemInstruction })
      }
      messages.push({ role: 'user', content: prompt })

      const apiResponse = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openRouterApiKey}`,
          'HTTP-Referer': 'https://fonoflow.vercel.app',
          'X-Title': 'FonoSuite Space',
        },
        body: JSON.stringify({
          model: process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat',
          messages,
          temperature: 0.7,
        }),
      })

      if (!apiResponse.ok) {
        console.error('OpenRouter provider request failed:', apiResponse.status)
        return response.status(502).json({ error: 'Erro ao obter resposta da Inteligência Artificial.' })
      }

      const data = await apiResponse.json()
      resultText = data?.choices?.[0]?.message?.content || ''
    } else {
      // Fallback opcional para Gemini quando o OpenRouter não estiver configurado.
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`

      const payload = {
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
      }

      if (systemInstruction) {
        payload.systemInstruction = {
          parts: [{ text: systemInstruction }],
        }
      }

      const apiResponse = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!apiResponse.ok) {
        console.error('Gemini provider request failed:', apiResponse.status)
        return response.status(502).json({ error: 'Erro ao obter resposta da Inteligência Artificial.' })
      }

      const data = await apiResponse.json()
      resultText = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
    }

    return response.status(200).json({ text: resultText, remaining: quota.remaining })
  } catch (error) {
    console.error('Error calling AI API:', error?.message || 'unknown_error')
    return response.status(500).json({ error: 'Internal Server Error' })
  }
}
