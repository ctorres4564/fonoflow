#!/usr/bin/env node
/**
 * Script administrativo para habilitar ou desabilitar a feature features.evolutionQualityReview de um profissional.
 * Deve ser executado em ambiente administrativo com credenciais apropriadas (Firebase Admin SDK).
 * 
 * Uso:
 *   node scripts/set-evolution-quality-review-feature.js --uid <UID> --enabled <true|false> --project <PROJECT_ID>
 */

import { getApps, initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

// Processar argumentos de linha de comando
const args = process.argv.slice(2)
const parseArgs = () => {
  const params = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].substring(2)
      const val = args[i + 1]
      params[key] = val
      i++
    }
  }
  return params
}

const params = parseArgs()
const uid = params.uid
const enabledStr = params.enabled
const project = params.project

if (!uid || !enabledStr || !project) {
  console.error('Erro: Parâmetros --uid, --enabled e --project são obrigatórios.')
  console.log('Uso: node scripts/set-evolution-quality-review-feature.js --uid <UID> --enabled <true|false> --project <PROJECT_ID>')
  process.exit(1)
}

if (enabledStr !== 'true' && enabledStr !== 'false') {
  console.error('Erro: --enabled deve ser "true" ou "false".')
  process.exit(1)
}

const enabled = enabledStr === 'true'

// Proteção explícita de projeto: Evitar executar em produção por engano se não fornecido e confirmado explicitamente
const allowedDemoProjects = ['demo-fonoflow']
if (!allowedDemoProjects.includes(project)) {
  console.warn(`ATENÇÃO: Você está executando contra um projeto não-demo/produção: "${project}".`)
  // Em contexto não interativo/CLI de teste, recusamos prosseguir se não for demo-fonoflow para segurança absoluta.
  if (process.env.NODE_ENV === 'production') {
    console.error('Erro: Script suspenso em produção por motivos de segurança.')
    process.exit(1)
  }
}

// Inicializar aplicativo do Firebase Admin
const initializeAdmin = () => {
  if (getApps().length > 0) return getApps()[0]
  
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    return initializeApp({ projectId: project })
  }
  
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n')
  const credentialProjId = process.env.FIREBASE_ADMIN_PROJECT_ID
  
  if (credentialProjId && credentialProjId !== project) {
    console.error(`Erro: O ID do projeto do ambiente (${credentialProjId}) difere do ID do projeto especificado (${project}).`)
    process.exit(1)
  }
  
  if (clientEmail && privateKey) {
    return initializeApp({
      credential: cert({
        projectId: project,
        clientEmail,
        privateKey
      })
    })
  }
  
  // Fallback para ADC
  return initializeApp({ projectId: project })
}

const run = async () => {
  const app = initializeAdmin()
  const auth = getAuth(app)
  const db = getFirestore(app)
  
  console.log(`Buscando usuário "${uid}" no Firebase Authentication...`)
  let authUser
  try {
    authUser = await auth.getUser(uid)
    console.log(`Usuário encontrado no Auth: ${authUser.email}`)
  } catch (error) {
    console.error(`Erro: Usuário com UID "${uid}" não foi encontrado no Firebase Authentication.`)
    process.exit(1)
  }
  
  const userRef = db.collection('users').doc(uid)
  const userSnap = await userRef.get()
  
  if (!userSnap.exists) {
    console.error(`Erro: Perfil do usuário "/users/${uid}" não existe no Firestore.`)
    process.exit(1)
  }
  
  const userData = userSnap.data()
  const currentFeatures = userData.features || {}
  
  console.log(`Valor atual da flag: ${currentFeatures.evolutionQualityReview}`)
  
  // Atualizar apenas o subcampo desejado mantendo outros campos de features intactos
  const updatedFeatures = {
    ...currentFeatures,
    evolutionQualityReview: enabled
  }
  
  console.log(`Atualizando "/users/${uid}" com features.evolutionQualityReview = ${enabled}...`)
  
  await db.runTransaction(async (transaction) => {
    transaction.update(userRef, {
      features: updatedFeatures,
      updatedAt: new Date().toISOString()
    })
    
    // Registrar ação administrativa no auditLogs se a coleção estiver disponível e seguindo o schema original
    const auditId = db.collection('auditLogs').doc().id
    transaction.create(db.collection('auditLogs').doc(auditId), {
      actorId: 'system.admin-cli',
      action: 'user.features.updated',
      patientId: null,
      resourceId: uid,
      changedFields: ['features.evolutionQualityReview'],
      occurredAt: new Date().toISOString(),
      source: 'scripts/set-evolution-quality-review-feature.js',
      schemaVersion: 1
    })
  })
  
  console.log('Sucesso: Flag de revisão de qualidade atualizada!')
  process.exit(0)
}

run().catch((err) => {
  console.error('Falha na execução do script:', err.message)
  process.exit(1)
})
