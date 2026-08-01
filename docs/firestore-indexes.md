# Consultas e Ã­ndices Firestore

| Consulta | ColeÃ§Ã£o | Campos | OrdenaÃ§Ã£o | Ãndice necessÃ¡rio | Arquivo |
|---|---|---|---|---|---|
| pacientes do usuÃ¡rio | `patients` | `userId ==` | cliente | simples automÃ¡tico | `src/services/patientService.js` |
| prefixo de nome normalizado | `patients` | `userId ==`, `search.normalizedName` | `search.normalizedName asc` | composto declarado | `src/services/patientService.js` |
| prefixo de telefone normalizado | `patients` | `userId ==`, `search.normalizedPhone` | `search.normalizedPhone asc` | composto declarado | `src/services/patientService.js` |
| agenda do usuÃ¡rio | `schedules` | `userId ==` | cliente | simples automÃ¡tico | `src/services/scheduleService.js` |
| evoluÃ§Ãµes para PDF | subcoleÃ§Ã£o `evolutions` | â€” | `date desc` | simples automÃ¡tico | `src/pages/ReportPrintPage.jsx` |
| retificaÃ§Ãµes | subcoleÃ§Ã£o `amendments` | â€” | `createdAt asc` | simples automÃ¡tico | `src/services/patientService.js` |
| eventos do ator | `auditLogs` | `actorId ==` | sem ordenaÃ§Ã£o | simples automÃ¡tico | `api/audit.js` |

A pesquisa de pacientes usa consultas por prefixo quando hÃ¡ pelo menos dois caracteres e recorre Ã  filtragem local se os Ã­ndices ainda nÃ£o estiverem implantados. Os dois Ã­ndices compostos correspondentes estÃ£o declarados em `firestore.indexes.json`; nenhuma migraÃ§Ã£o ou implantaÃ§Ã£o foi executada automaticamente.
