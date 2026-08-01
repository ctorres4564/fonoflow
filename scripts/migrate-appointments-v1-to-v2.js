import { runMigration } from './schema-migration-runner.js'
import { convertAppointmentV1ToV2 } from '../src/mappers/appointment.mapper.js'
await runMigration({entity:'appointments',queryFactory:(db)=>db.collection('schedules'),convert:convertAppointmentV1ToV2})
