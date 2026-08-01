import { afterAll, beforeAll, describe, it } from 'vitest'
import { assertFails, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteObject, getBytes, listAll, ref, uploadBytes } from 'firebase/storage'
import { readFileSync } from 'node:fs'

const projectId = 'demo-fonoflow'
let testEnv

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    storage: { rules: readFileSync('storage.rules', 'utf8') },
  })
})

afterAll(async () => {
  await testEnv.cleanup()
})

describe('Firebase Storage backend-only', () => {
  const availablePath =
    'users/professional-a/patients/patient-a/documents/document-a/available/version-a/random.pdf'
  const quarantinePath =
    'users/professional-a/patients/patient-a/documents/document-a/quarantine/upload-a/random.pdf'

  it('bloqueia upload direto mesmo para usuario autenticado', async () => {
    const storage = testEnv.authenticatedContext('professional-a').storage()
    await assertFails(uploadBytes(ref(storage, quarantinePath), new Uint8Array([37, 80, 68, 70])))
  })

  it('bloqueia leitura direta autenticada e anonima', async () => {
    const ownedStorage = testEnv.authenticatedContext('professional-a').storage()
    const anonymousStorage = testEnv.unauthenticatedContext().storage()
    await assertFails(getBytes(ref(ownedStorage, availablePath)))
    await assertFails(getBytes(ref(anonymousStorage, availablePath)))
  })

  it('bloqueia sobrescrita, exclusao e listagem pelo cliente', async () => {
    const storage = testEnv.authenticatedContext('professional-a').storage()
    await assertFails(uploadBytes(ref(storage, availablePath), new Uint8Array([1])))
    await assertFails(deleteObject(ref(storage, availablePath)))
    await assertFails(listAll(ref(storage, 'users/professional-a')))
  })
})
