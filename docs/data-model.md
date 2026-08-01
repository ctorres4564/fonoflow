# Modelo de dados consolidado

> O registro operacional domiciliar está em `schedules/{appointmentId}/homeCareVisit/current` e é detalhado em `docs/home-care-data-model.md`. Ele não substitui o agendamento nem a evolução clínica.

> Consentimentos versionados são armazenados em `patients/{patientId}/consents/{consentId}`. O modelo, versionamento e compatibilidade legada estão em `docs/consents-data-model.md`.

## Versões

A ausência de `schemaVersion` identifica documentos V1. Novas entidades principais usam `schemaVersion: 2`. Versões futuras são recusadas pelos normalizadores com `SchemaNormalizationError`; uma leitura nunca persiste a conversão.

## Coleções

- `patients/{patientId}`: propriedade definida por `userId`. O V2 separa `personalData`, `contact`, `address`, `legalRepresentative`, `emergencyContact`, `clinicalProfile`, `clinicalAlerts`, `homeCare`, `administrative` e `search`. Status: `active`, `inactive`, `discharged`, `archived`.
- `patients/{patientId}/evolutions/{evolutionId}`: conteúdo estruturado e `richText` (HTML opcional, JSON TipTap e texto simples obrigatório). Status: `draft`, `finalized`, `voided`. O original finalizado não é reescrito; anulação altera somente metadados autorizados.
- `.../evolutions/{id}/amendments`: retificações imutáveis.
- `.../evolutions/{id}/qualityReviews`: somente leitura pelo cliente; backend escreve.
- `patients/{id}/anamnesis`, `therapeuticPlan`, `documents`, `progressAnalyses`, `evolutionDrafts`: subcoleções existentes, preservadas.
- `schedules/{scheduleId}`: agenda V2 com `scheduledStart`, `scheduledEnd`, localização e `sessionAccounting`. O histórico em `statusHistory` é imutável.
- `auditLogs`, `evolutionFinalizeOperations`, `evolutionFinalizeRateLimits`: coleções técnicas sem acesso direto do cliente.

## Relações e propriedade

Paciente e agenda pertencem ao `userId`. Evoluções herdam a autorização do paciente e vinculam `patientId`, `professionalId` e opcionalmente `appointmentId`. `organizationId` é somente dado; não concede acesso enquanto não existir autorização organizacional completa.

## Compatibilidade

## DicionÃ¡rio campo a campo

### Pacientes V2

| Campo | Tipo | ObrigatÃ³rio | Origem | Finalidade | MutÃ¡vel | Campo legado | ObservaÃ§Ãµes de seguranÃ§a |
|---|---|---|---|---|---|---|---|
| `schemaVersion` | literal 2 | sim | sistema | versÃ£o | nÃ£o | ausente | futuras rejeitadas |
| `userId` | string | sim | autenticaÃ§Ã£o | propriedade | nÃ£o | igual | transferÃªncia bloqueada |
| `personalData.*` | map | sim | formulÃ¡rio | nome, nascimento, CPF/CNS, identidade | sim | `name`, `birthDate` | dados sensÃ­veis |
| `contact.*` | map | sim | formulÃ¡rio | telefone/e-mail | sim | `phone` | normalizado para busca |
| `address.*` | map | sim | formulÃ¡rio | endereÃ§o | sim | `address` | nÃ£o logar |
| `legalRepresentative.*` | map | nÃ£o | formulÃ¡rio | responsÃ¡vel | sim | `guardian` | dados pessoais |
| `emergencyContact.*` | map | nÃ£o | formulÃ¡rio | emergÃªncia | sim | â€” | dados pessoais |
| `clinicalProfile.*` | map | sim | profissional | perfil clÃ­nico | sim | `diagnosis`, `complaint`, `notes` | nÃ£o auditar conteÃºdo |
| `clinicalAlerts.*` | map | sim | profissional | alertas declarados | sim | â€” | sem inferÃªncia |
| `homeCare.*` | map | sim | formulÃ¡rio | domicÃ­lio | sim | parcial | endereÃ§o protegido |
| `administrative.*` | map | sim | UI/transaÃ§Ã£o | contrato e contadores | parcial | `totalSessions`, `completedSessions` | contador transacional |
| `status` | enum | sim | UI/transaÃ§Ã£o | ciclo do paciente | sim | status em portuguÃªs | Rules validam enum |
| `search.*` | map | nÃ£o | mapper | busca normalizada | derivado | â€” | nÃ£o Ã© fonte clÃ­nica |
| `createdAt/By` | timestamp/string | sim | sistema | autoria | nÃ£o | igual | protegidos |
| `updatedAt/By` | timestamp/string | nÃ£o | sistema | alteraÃ§Ã£o | sistema | igual | ator autenticado |

### EvoluÃ§Ãµes V2

| Campo | Tipo | ObrigatÃ³rio | Origem | Finalidade | MutÃ¡vel | Campo legado | ObservaÃ§Ãµes de seguranÃ§a |
|---|---|---|---|---|---|---|---|
| `schemaVersion` | literal 2 | sim | sistema | versÃ£o | nÃ£o | ausente | futura rejeitada |
| `patientId/professionalId` | string | sim | contexto/token | vÃ­nculos | nÃ£o | `patientId/authorId` | body nÃ£o define ator |
| `appointmentId` | string/null | nÃ£o | agenda | associaÃ§Ã£o | nÃ£o apÃ³s finalizar | `scheduleId` | propriedade verificada |
| `serviceDate/durationMinutes` | data/nÃºmero | sim | UI | sessÃ£o | sÃ³ rascunho | `date/duration` | limites Zod |
| `structuredContent.*` | map | sim | UI/backend | conteÃºdo estruturado | sÃ³ rascunho | campos soltos | nÃ£o logar integralmente |
| `richText.*` | map | sim | TipTap | HTML/JSON/texto | sÃ³ rascunho | `richContent/notes` | texto simples obrigatÃ³rio ao finalizar |
| `status` | enum | sim | workflow | draft/finalized/voided | controlado | `voided` | finalizada imutÃ¡vel |
| `finalizedAt/By` | timestamp/string | finalizada | backend | prova | nÃ£o | â€” | ator autenticado |
| `voidedAt/By/Reason` | campos | anulada | operaÃ§Ã£o | anulaÃ§Ã£o | uma vez | equivalentes | motivo obrigatÃ³rio |
| `createdAt/By` | timestamp/string | sim | sistema | autoria | nÃ£o | igual | protegidos |
| `amendments/*` | documento | nÃ£o | profissional | adendo | nÃ£o | â€” | create-only |
| `qualityReviews/*` | documento | nÃ£o | backend | revisÃ£o | nÃ£o pelo cliente | â€” | Rules bloqueiam escrita |

### Agendamentos V2

| Campo | Tipo | ObrigatÃ³rio | Origem | Finalidade | MutÃ¡vel | Campo legado | ObservaÃ§Ãµes de seguranÃ§a |
|---|---|---|---|---|---|---|---|
| `schemaVersion` | literal 2 | sim | sistema | versÃ£o | nÃ£o | ausente | futura rejeitada |
| `userId/patientId` | string | sim | token/contexto | propriedade | nÃ£o | igual | parsers protegem |
| `serviceType` | enum | sim | UI | modalidade | antes de concluir | `sessionType` | enum validado |
| `scheduledStart/End` | timestamp | sim | UI | intervalo | antes de concluir | data/horas | fim posterior |
| `status` | enum | sim | transaÃ§Ã£o | ciclo | matriz central | portuguÃªs | terminais nÃ£o reabrem |
| `sessionAccounting.*` | map | sim | transaÃ§Ã£o | dÃ©bito/idempotÃªncia | transacional | `sessionDeducted` | sÃ³ `completed` debita |
| `location/notes` | map/string | nÃ£o | UI | contexto | antes de concluir | equivalentes | tamanho limitado |
| `createdAt/By` | timestamp/string | sim | sistema | autoria | nÃ£o | igual | protegidos |
| `updatedAt` | timestamp | nÃ£o | sistema | alteraÃ§Ã£o | sistema | igual | server timestamp |
| `statusHistory/{operationId}` | documento | por transiÃ§Ã£o | transaÃ§Ã£o | histÃ³rico/idempotÃªncia | nÃ£o | histÃ³rico aleatÃ³rio | replay divergente rejeitado |
| `evolutionId` | string | apÃ³s conclusÃ£o | workflow | associa evoluÃ§Ã£o | nÃ£o | igual | bloqueia duplicidade |

Aliases sÃ£o temporÃ¡rios e somente serÃ£o removidos apÃ³s migraÃ§Ã£o completa, telemetria sem documentos V1 e uma versÃ£o futura planejada.

### Registro detalhado dos campos aninhados

| Campo | Tipo | ObrigatÃ³rio | DescriÃ§Ã£o | Origem | MutÃ¡vel | Legado | ObservaÃ§Ãµes |
|---|---|---|---|---|---|---|---|
| `personalData.fullName` | string | sim | nome completo | UI | sim | `name` | Ã­ndice normalizado derivado |
| `personalData.socialName` | string/null | nÃ£o | nome social | UI | sim | â€” | dado pessoal |
| `personalData.birthDate` | data ISO/null | nÃ£o | nascimento | UI | sim | `birthDate` | calendÃ¡rio vÃ¡lido |
| `personalData.cpf/cns` | string/null | nÃ£o | documentos | UI | sim | â€” | CPF validado; sensÃ­vel |
| `personalData.sex/genderIdentity` | string/null | nÃ£o | identificaÃ§Ã£o | UI | sim | â€” | sensÃ­vel |
| `contact.phone/secondaryPhone` | string/null | nÃ£o | telefones | UI | sim | `phone` | somente dÃ­gitos no Ã­ndice |
| `contact.email` | e-mail/null | nÃ£o | contato | UI | sim | â€” | formato validado |
| `address.postalCode/street/number` | string/null | nÃ£o | endereÃ§o | UI | sim | `address` | nÃ£o logar |
| `address.complement/district/city/state/referencePoint` | string/null | nÃ£o | complemento territorial | UI | sim | `address` | UF enumerada |
| `legalRepresentative.name/cpf/relationship/phone/email` | strings/null | nÃ£o | responsÃ¡vel legal | UI | sim | `guardian` | CPF/e-mail validados |
| `emergencyContact.name/relationship/phone` | strings/null | nÃ£o | emergÃªncia | UI | sim | â€” | dado pessoal |
| `clinicalProfile.diagnosis/diagnosticHypothesis` | string/null | nÃ£o | diagnÃ³stico declarado | profissional | sim | `diagnosis` | nÃ£o inferido |
| `clinicalProfile.cidCodes/cifCodes` | string[] | nÃ£o | classificaÃ§Ãµes | profissional | sim | â€” | itens nÃ£o vazios |
| `clinicalProfile.referralSource/mainComplaint/generalObservations` | string/null | nÃ£o | contexto clÃ­nico | profissional | sim | `complaint/notes` | nÃ£o logar integralmente |
| `clinicalAlerts.allergies/medications` | string[] | nÃ£o | alertas textuais | profissional | sim | â€” | sem interpretaÃ§Ã£o automÃ¡tica |
| `clinicalAlerts.aspirationRisk/tracheostomy/gastrostomy/oxygenUse/epilepsy` | boolean | nÃ£o | alertas binÃ¡rios | profissional | sim | â€” | UI inclui texto acessÃ­vel |
| `clinicalAlerts.dietaryRestrictions/mobilityRestrictions/otherAlerts` | string[] | nÃ£o | restriÃ§Ãµes | profissional | sim | â€” | somente preenchidos sÃ£o exibidos |
| `homeCare.enabled/serviceAddressSameAsPatientAddress` | boolean | sim | habilita domicÃ­lio/reuso | UI | sim | parcial | controla campos condicionais |
| `homeCare.serviceAddress` | address | nÃ£o | local alternativo | UI | sim | â€” | somente quando necessÃ¡rio |
| `homeCare.accessInstructions/householdRisks/mobilityConditions` | string/string[] | nÃ£o | acesso e riscos | UI | sim | â€” | dado operacional sensÃ­vel |
| `homeCare.caregiverName/caregiverPhone/preferredPeriods` | string/string[] | nÃ£o | cuidador e perÃ­odos | UI | sim | â€” | dado pessoal |
| `administrative.serviceType` | enum | sim | particular/convÃªnio/instituiÃ§Ã£o/outro | UI | sim | â€” | enum Zod |
| `administrative.insuranceName/registrationNumber` | string/null | nÃ£o | convÃªnio | UI | sim | â€” | dado administrativo |
| `administrative.sessionValue/paymentNotes` | nÃºmero/string | nÃ£o | valor/observaÃ§Ã£o | UI | sim | â€” | nÃ£o negativo |
| `administrative.contractedSessions` | inteiro/null | nÃ£o | limite contratado | UI | sim por fluxo autorizado | `totalSessions` | base do limite |
| `administrative.completedSessions` | inteiro | nÃ£o | sessÃµes debitadas | transaÃ§Ã£o | nÃ£o pela UI | `completedSessions` | nunca acima do contrato |
| `search.normalizedName/normalizedPhone` | string/string-null | nÃ£o | auxiliares de busca | mapper | derivado | â€” | sem acentos/formataÃ§Ã£o |
| `structuredContent.sessionObjectives/procedures` | string[] | nÃ£o | objetivos/procedimentos | profissional | sÃ³ rascunho | campos soltos | itens nÃ£o vazios |
| `structuredContent.clinicalFindings/patientResponse/performanceSummary` | string/null | nÃ£o | achados e resposta | profissional | sÃ³ rascunho | atividade/resposta | conteÃºdo clÃ­nico |
| `structuredContent.incidents/familyGuidance/nextSessionPlan` | string/null | nÃ£o | intercorrÃªncias e plano | profissional | sÃ³ rascunho | `nextStep` | conteÃºdo clÃ­nico |
| `richText.html/json/plainText` | string/objeto/string | sim no bloco | representaÃ§Ãµes TipTap | editor | sÃ³ rascunho | `richContent/notes` | texto simples nÃ£o vazio ao finalizar |
| `startedAt/endedAt/durationMinutes` | timestamp/timestamp/nÃºmero | nÃ£o | duraÃ§Ã£o clÃ­nica | UI/backend | sÃ³ rascunho | `duration` | nÃ£o negativo |
| `finalizedAt/finalizedBy` | timestamp/string | finalizada | finalizaÃ§Ã£o | backend | nÃ£o | â€” | ator autenticado |
| `voided/voidedAt/voidedBy/voidReason` | boolean/timestamp/string/string | anulada | anulaÃ§Ã£o | operaÃ§Ã£o restrita | uma vez | equivalentes | motivo obrigatÃ³rio |
| `scheduledStart/scheduledEnd` | timestamp | sim | intervalo | UI | antes de terminal | data/horas | tÃ©rmino posterior |
| `location.address/referencePoint/accessInstructions` | string/null | nÃ£o | local | UI | antes de terminal | endereÃ§o solto | nÃ£o logar |
| `sessionAccounting.deductSession` | boolean | sim | indica dÃ©bito | transaÃ§Ã£o | nÃ£o pela UI | `sessionDeducted` | verdadeiro somente em `completed` |
| `sessionAccounting.deductedAt/deductionOperationId` | timestamp/string-null | nÃ£o | prova de dÃ©bito | transaÃ§Ã£o | nÃ£o | campos raiz | chave idempotente |
| `statusHistory.previousStatus/status/reason` | enum/enum/string | sim | transiÃ§Ã£o | transaÃ§Ã£o | nÃ£o | status PT | histÃ³rico imutÃ¡vel |
| `statusHistory.actorId/operationId/changedAt` | string/string/timestamp | sim | autoria/idempotÃªncia | autenticaÃ§Ã£o/transaÃ§Ã£o | nÃ£o | â€” | Rules vinculam ator e ID |
| `rescheduledFromId/rescheduledToId/evolutionId` | string | nÃ£o | ligaÃ§Ãµes | transaÃ§Ã£o | nÃ£o | equivalentes | impede duplicidade |

Os mappers traduzem em memória `name`, `phone`, `diagnosis`, `complaint`, `date`, `duration`, `notes`, `richContent`, horários e status em português. Contadores legados de sessões permanecem gravados temporariamente porque participam das transações idempotentes. Consulte o inventário para o mapa completo.
# Anexos clínicos — Etapa 6B

Anexos reutilizam `patients/{patientId}/documents/{documentId}` e adicionam `clinicalContext`, `consentContext`, `attachmentFinalizedAt` e campos de arquivamento. Referências imutáveis ficam nas subcoleções `attachments` de evolução, agenda e visita Home Care. Consulte `clinical-attachments-data-model.md` para campos, categorias e compatibilidade V1/V2.
