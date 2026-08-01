import fs from 'node:fs/promises'
import process from 'node:process'
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

export async function runMigration({ entity, queryFactory, convert }) {
  const args = new Set(process.argv.slice(2)); const execute = args.has('--execute');
  if (execute && !args.has('--confirm-write')) throw new Error('Para gravar, use --execute --confirm-write explicitamente.')
  const option = (name, fallback) => { const item=process.argv.find((arg)=>arg.startsWith(`${name}=`)); return item ? item.slice(name.length+1) : fallback }
  const limit = Math.max(1, Number(option('--limit','500'))); const onlyId=option('--document',''); const resumeAfter=option('--resume-after','')
  if (!getApps().length) initializeApp({ credential: applicationDefault() })
  const db=getFirestore(); let query=queryFactory(db); if (onlyId) query=query.where('__name__','==',onlyId); if (resumeAfter) query=query.startAfter(resumeAfter); query=query.limit(limit)
  const report={entity,mode:execute?'execute':'dry-run',startedAt:new Date().toISOString(),success:0,failed:0,skipped:0,documents:[]}
  const snapshot=await query.get()
  for (const document of snapshot.docs) { try { const raw=document.data(); if (raw.schemaVersion===2) { report.skipped++; report.documents.push({id:document.id,status:'skipped',reason:'already-v2'}); continue } const converted=convert({...raw,id:document.id}); if (execute) await document.ref.set(converted,{merge:true}); report.success++; report.documents.push({id:document.id,status:execute?'written':'simulated'}) } catch(error) { report.failed++; report.documents.push({id:document.id,status:'failed',error:error.message}) } }
  report.finishedAt=new Date().toISOString(); report.resumeAfter=snapshot.docs.at(-1)?.id || null
  const file=`migration-${entity}-${Date.now()}.json`; await fs.writeFile(file,JSON.stringify(report,null,2)); console.log(JSON.stringify({...report,documents:undefined,reportFile:file})); return report
}
