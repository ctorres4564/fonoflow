import { runMigration } from './schema-migration-runner.js'
import { convertEvolutionV1ToV2 } from '../src/mappers/evolution.mapper.js'
await runMigration({entity:'evolutions',queryFactory:(db)=>db.collectionGroup('evolutions'),convert:convertEvolutionV1ToV2})
