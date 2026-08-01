# Auditoria de agenda e contabilizaÃ§Ã£o de sessÃµes

| OperaÃ§Ã£o | Arquivo | Estado inicial | Estado final | Altera contador? | Transacional? | Idempotente? |
|---|---|---|---|---|---|---|
| Criar agendamento | `scheduleService.js` | inexistente | `scheduled` | nÃ£o | gravaÃ§Ã£o Ãºnica | n/a |
| Alterar status | `transitionAppointmentStatus` | conforme matriz | destino permitido | somente ao entrar em `completed` | sim | sim, `operationId` no histÃ³rico |
| Concluir com evoluÃ§Ã£o | `patientService.js` | aberto | `completed` | +1 | sim | bloqueio por `evolutionId`/status |
| Finalizar com revisÃ£o | `evolutionFinalizeWorkflow.js` | paciente ativo | finalizada; agenda opcional concluÃ­da | +1 quando solicitado | sim | documento de operaÃ§Ã£o |
| EvoluÃ§Ã£o manual | `patientService.js` | paciente ativo | finalizada | +1 quando solicitado | sim | nÃ£o; UI bloqueia duplo envio |
| Cancelar/ausÃªncia | `transitionAppointmentStatus` | aberto | terminal/ausente | nÃ£o | sim | sim |
| Reagendar | `transitionAppointmentStatus` | permitido | original `rescheduled`; novo `scheduled` | nÃ£o | sim | sim |
| Reabrir concluÃ­do | matriz central | `completed` | rejeitado | nÃ£o | n/a | determinÃ­stico |

Somente `completed` debita. Contadores sÃ£o limitados ao contratado e nunca negativos. V1 usa aliases e contadores raiz; V2 tambÃ©m sincroniza `administrative.completedSessions` e `sessionAccounting`.
