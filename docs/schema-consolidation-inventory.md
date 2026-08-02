# Inventário para consolidação de schemas

Auditoria realizada sobre `src`, `api`, `scripts`, `firestore.rules` e testes. O cliente é JavaScript/React; pacientes ficam em `patients`, agenda em `schedules` e evoluções em `patients/{patientId}/evolutions`.

| Campo atual | Coleção | Arquivos que usam | Novo campo | Compatibilidade |
|---|---|---|---|---|
| `name` | patients | PatientFormModal, PatientTable, Dashboard, Agenda, EvolutionModal, patientService | `personalData.fullName` | mapper expõe `name`; escrita V2 mantém legado |
| `phone` | patients | formulário, busca, Agenda/WhatsApp | `contact.phone` | mapper expõe `phone`; índice `search.normalizedPhone` |
| `birthDate` | patients | formulário, dashboard | `personalData.birthDate` | alias legado preservado |
| `address` | patients | formulário, tabela, PDF/exportação | `address.street` | string legado preservado; conversão não destrutiva |
| `guardian` | patients | formulário/tabela | `legalRepresentative.name` | alias legado preservado |
| `diagnosis` | patients | prontuário, PDF/exportação | `clinicalProfile.diagnosis` | alias legado preservado |
| `complaint` | patients | formulário/prontuário | `clinicalProfile.mainComplaint` | alias legado preservado |
| `notes` | patients | formulário/prontuário | `clinicalProfile.generalObservations` | alias legado preservado |
| `totalSessions` | patients | formulário, dashboard, transações | `administrative.contractedSessions` | ambos mantidos durante transição |
| `completedSessions` | patients | dashboard, agenda, finalização | `administrative.completedSessions` | ambos mantidos; transações continuam idempotentes |
| `remainingSessions` | patients | UI/transações | derivado | legado mantido, nunca fonte canônica V2 |
| `status` (`Ativo`/`Finalizado`) | patients | dashboard, transações, backend | `status` (`active`/`discharged`) | mapper expõe status legado para UI; valor legado mantido na escrita compatível |
| `date` | evolutions | EvolutionModal, ordenação, finalização | `serviceDate` | alias legado preservado |
| `duration` | evolutions | formulário/finalização | `durationMinutes` | alias legado preservado |
| `notes` | evolutions | PDF, pesquisa, IA | `richText.plainText` | texto simples obrigatório; alias preservado |
| `richContent` | evolutions | TipTap, PDF | `richText.json` | JSON sanitizado preservado |
| `scheduleId` | evolutions | finalização | `appointmentId` | ambos preservados |
| `date`, `startTime`, `endTime` | schedules | Agenda, Dashboard | `scheduledStart`, `scheduledEnd` | aliases preservados para UI |
| `sessionType` | schedules | Agenda/finalização | `serviceType` | mapeamento conservador; alias preservado |
| status em português | schedules | Agenda, dashboard, transações | status canônico em inglês | mapper expõe legado; histórico não é reescrito |
| `sessionDeducted` | schedules | transações/finalização | `sessionAccounting.deductSession` | ambos mantidos; operação segue transacional |

## Dependências identificadas

- Leituras/escritas: `patientService.js`, `scheduleService.js`, serviços de subcoleções.
- Backend sensível: `api/_lib/evolutionFinalizeWorkflow.js` e módulos de validação/contrato.
- Regras: propriedade por `userId`, evoluções e adendos imutáveis, quality reviews e auditoria bloqueadas.
- PDFs/exportações: `EvolutionModal.jsx`, `ReportPrintPage.jsx` e `evolutionFormatter.js`.
- Mocks/testes: Vitest em `src` e `api/_lib`; Rules em `tests/firestore.rules.test.js`.

Leituras V1 são convertidas somente em memória. Nenhuma leitura grava dados e nenhum campo legado será removido nesta fase.
