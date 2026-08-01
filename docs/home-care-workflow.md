# Fluxo operacional Home Care

Fluxo principal: `planned → in_transit → arrived → in_service → completed`.

Alternativas: `planned → patient_absent`, `planned → cancelled`, `in_transit → cancelled` e `arrived → patient_absent`. Estados finais não aceitam transições.

| Visita | Agenda |
|---|---|
| `planned` | `scheduled`/estado inicial |
| `in_transit` | `in_transit` |
| `arrived` | `arrived` |
| `in_service` | permanece `arrived` |
| `completed` | `completed` |
| `patient_absent` | `patient_absent` |
| `cancelled` | `cancelled_by_professional` |

Mudanças correspondentes chamam `transitionAppointmentStatus`. A visita operacional é gravada por uma mutação relacionada dentro do mesmo `runTransaction` que atualiza agenda, saldo e histórico. A conclusão herda o débito único e a idempotência por `operationId`; falta e cancelamento não debitam.

“Abrir evolução” encaminha os identificadores ao fluxo existente, sem preencher ou finalizar conteúdo clínico. Ocorrências operacionais exigem descrição e geram auditoria mínima.

Google Maps e Waze recebem o endereço codificado do snapshot. A distância real é manual. Não há GPS contínuo, localização em segundo plano ou coordenadas armazenadas.
