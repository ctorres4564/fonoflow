import { runMigration } from './schema-migration-runner.js'
import { convertPatientV1ToV2 } from '../src/mappers/patient.mapper.js'
await runMigration({entity:'patients',queryFactory:(db)=>db.collection('patients'),convert:convertPatientV1ToV2})
