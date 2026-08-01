import { spawnSync } from 'node:child_process'

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('VerificaÃ§Ã£o bloqueada fora do emulador.')
const commands = [
  ['scripts/seed-schema-migration-fixtures.js'],
  ['scripts/migrate-patients-v1-to-v2.js','--dry-run'],
  ['scripts/migrate-evolutions-v1-to-v2.js','--dry-run'],
  ['scripts/migrate-appointments-v1-to-v2.js','--dry-run'],
  ['scripts/migrate-patients-v1-to-v2.js','--dry-run'],
  ['scripts/migrate-evolutions-v1-to-v2.js','--dry-run'],
  ['scripts/migrate-appointments-v1-to-v2.js','--dry-run'],
]
for (const args of commands) {
  const result=spawnSync(process.execPath,args,{stdio:'inherit',env:process.env})
  if(result.status!==0) process.exit(result.status || 1)
}
