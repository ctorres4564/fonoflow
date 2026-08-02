# Auditoria de integração do módulo Home Care

## Decisão arquitetural

O registro operacional usa `schedules/{appointmentId}/homeCareVisit/current`. A relação direta herda a propriedade do agendamento e mantém uma visita por compromisso. A agenda permanece em `schedules` e as evoluções em `patients/{patientId}/evolutions`.

| Arquivo | Função atual | Relação com home care | Alteração necessária |
|---|---|---|---|
| `src/schemas/patient.schema.js` | Paciente V2 | Endereço alternativo, acesso, cuidador e alertas | Reutilizado |
| `src/schemas/appointment.schema.js` | Agenda V2 | Tipo, horário e localização | Reutilizado |
| `src/domain/appointments/appointmentTransitions.js` | Matriz da agenda | Estados e contabilização | Reutilizado pelo serviço Home Care |
| `src/services/scheduleService.js` | Transação, idempotência e débito | Único ponto para concluir/faltar/cancelar | Reutilizado sem novo débito |
| `src/pages/AgendaPage.jsx` | Agenda geral | Fonte única dos compromissos | Mantida; a nova visão é apenas um filtro operacional |
| `src/components/patients/ScheduleModal.jsx` | Formulário de agendamento | Origina a visita | Reutilizado |
| `src/components/patients/EvolutionModal.jsx` | Evolução clínica | Destino de “Abrir evolução” | Mantido separado |
| `src/services/auditService.js`, `api/audit.js` | Auditoria autenticada | Eventos mínimos da visita | Contrato ampliado |
| `firestore.rules` | Segurança | Propriedade, estados e imutabilidade | Subcoleção protegida |
| `tests/firestore.rules.test.js` | Testes de autorização | Isolamento e imutabilidade | Casos adicionados |

## Persistência

- A consulta da agenda não muda; os detalhes são carregados sob demanda.
- IDs críticos são imutáveis e a propriedade deriva do documento pai.
- Relatórios futuros podem usar collection group `homeCareVisit` com índices próprios.
- Um documento operacional por agendamento evita aumentar o documento principal.
- Não existe segunda agenda nem segundo prontuário.
