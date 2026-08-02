import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
if(!process.env.FIRESTORE_EMULATOR_HOST||!process.env.FIREBASE_AUTH_EMULATOR_HOST)throw new Error('RepetiÃ§Ã£o bloqueada fora dos emuladores.')
const runs=Number(process.env.EMULATOR_REPEAT_COUNT||10);const results=[]
for(let run=1;run<=runs;run+=1){const result=spawnSync('npm',['run','test:emulator:unit'],{encoding:'utf8',env:process.env,shell:process.platform==='win32'});const passed=result.status===0;results.push({run,passed});process.stdout.write(`ExecuÃ§Ã£o ${run}/${runs}: ${passed?'PASSOU':'FALHOU'}\n`);if(!passed){const log=`ExecuÃ§Ã£o ${run}\nSTDOUT\n${result.stdout}\nSTDERR\n${result.stderr}`;writeFileSync('emulator-repeat-first-failure.log',log);process.stdout.write(log);process.exit(result.status||1)}}
process.stdout.write(`${JSON.stringify({runs,passed:results.filter(x=>x.passed).length,failed:0})}\n`)
