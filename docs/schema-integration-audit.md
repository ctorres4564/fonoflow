# Auditoria de integraÃ§Ã£o do Schema V2

Auditoria por busca estÃ¡tica de chamadas Firestore em `src`, `api` e `scripts` (31/07/2026). SubcoleÃ§Ãµes auxiliares fora das trÃªs entidades continuam com seus contratos prÃ³prios.

| Arquivo | Entidade | Tipo de operaÃ§Ã£o | Usa mapper? | Usa Zod? | Ajuste necessÃ¡rio |
|---|---|---|---|---|---|
| `src/services/patientService.js` | pacientes | leitura/CRUD | sim | sim em create/update | exclusÃ£o nÃ£o requer payload |
| `src/services/patientService.js` | evoluÃ§Ãµes | leitura/criaÃ§Ã£o/finalizaÃ§Ã£o/anulaÃ§Ã£o | sim na leitura | parcial | consolidar transaÃ§Ãµes antigas no workflow backend |
| `src/services/scheduleService.js` | agenda | leitura/CRUD/status/reagenda | sim | sim em create/update | status transacional ainda preserva aliases legados |
| `src/pages/ReportPrintPage.jsx` | pacientes/evoluÃ§Ãµes | leitura para PDF | sim | n/a | concluÃ­do |
| `src/pages/PatientsPage.jsx` | pacientes | pesquisa/gravaÃ§Ã£o via service | objeto normalizado | via service | concluÃ­do |
| `src/pages/DashboardPage.jsx` | pacientes | cÃ¡lculo em dados do layout | objeto normalizado | n/a | concluÃ­do |
| `src/pages/AgendaPage.jsx` | agenda | visualizaÃ§Ã£o em dados do layout | objeto normalizado | via service | concluÃ­do |
| `api/_lib/evolutionFinalizeWorkflow.js` | evoluÃ§Ãµes/pacientes | transaÃ§Ã£o de finalizaÃ§Ã£o | contrato prÃ³prio | sim | manter idempotÃªncia existente |
| `api/audit.js` | pacientes/auditoria | verifica propriedade e grava evento | n/a (somente `userId`) | validaÃ§Ã£o manual | migrar para Zod quando o contrato de auditoria for versionado |
| `scripts/migrate-*-v1-to-v2.js` | trÃªs entidades | leitura e merge administrativo | conversores V1â†’V2 | schemas nos conversores | executar somente no emulador nesta tarefa |
| `src/services/anamnesisService.js` | anamnese | leitura/escrita | n/a | contrato legado | fora das trÃªs entidades consolidadas |
| `src/services/documentService.js` | documentos | leitura/escrita | n/a | contrato legado | fora das trÃªs entidades consolidadas |
| `src/services/therapeuticPlanService.js` | plano terapÃªutico | leitura/transaÃ§Ã£o | n/a | contrato legado | fora das trÃªs entidades consolidadas |

Consultas identificadas: pacientes e agenda por `userId`; evoluÃ§Ãµes do relatÃ³rio por `date desc`; retificaÃ§Ãµes por `createdAt asc`; auditoria backend por `actorId` com limite. Nenhum componente deve interpretar campos V1 diretamente: aliases de apresentaÃ§Ã£o sÃ£o produzidos exclusivamente pelos mappers.
