import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { getApps, deleteApp } from 'firebase-admin/app'
import { execSync } from 'node:child_process'

const projectId = 'demo-fonoflow'
let testEnv

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: '127.0.0.1',
      port: 8080
    }
  })
})

beforeEach(async () => {
  await testEnv.clearFirestore()
})

afterAll(async () => {
  await testEnv.cleanup()
  const apps = getApps()
  for (const app of apps) {
    await deleteApp(app)
  }
})

describe('Script administrativo de habilitação', () => {
  it('rejeita se argumentos obrigatórios estão ausentes', () => {
    try {
      execSync('node scripts/set-evolution-quality-review-feature.js', { env: process.env, stdio: 'pipe' })
      throw new Error('should-have-failed')
    } catch (error) {
      expect(error.message).toContain('Parâmetros --uid, --enabled e --project são obrigatórios')
    }
  }, 25000)

  it('rejeita se UID não existe no Authentication', async () => {
    // Definimos variáveis para simular o Firestore Emulator
    const env = {
      ...process.env,
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
      GCLOUD_PROJECT: projectId
    }
    try {
      execSync('node scripts/set-evolution-quality-review-feature.js --uid non-existent-uid --enabled true --project demo-fonoflow', { env, stdio: 'pipe' })
      throw new Error('should-have-failed')
    } catch (error) {
      expect(error.message).toContain('não foi encontrado no Firebase Authentication')
    }
  }, 25000)
})
