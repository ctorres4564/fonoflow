# Modelo de dados Home Care

Persistência: `schedules/{appointmentId}/homeCareVisit/current`, schema versão 1.

| Campo | Tipo | Obrigatório | Origem | Finalidade | Mutável | Observação |
|---|---|---:|---|---|---:|---|
| `appointmentId` | string | Sim | Agendamento | Vínculo principal | Não | Igual ao pai |
| `patientId` | string | Sim | Agendamento | Vínculo com paciente | Não | Não confiado ao formulário |
| `professionalId`, `userId` | string | Sim | Autenticação | Propriedade | Não | Iguais ao ator |
| `status` | enum | Sim | Fluxo | Estado da visita | Sim | Terminal após encerramento |
| `location.addressSnapshot` | map | Sim | Paciente/agendamento | Endereço histórico | Não | Alternativo > principal > manual |
| `accessInstructionsSnapshot` | string/null | Sim | Cadastro | Acesso ao domicílio | Não | Snapshot histórico |
| `schedule.*` | Timestamp | Sim | Agenda | Horário histórico | Não | Início e fim |
| `travel` | map | Sim | Ações/profissional | Deslocamento e km | Sim | Valores não negativos; km manual |
| `service` | map | Sim | Ações/profissional | Atendimento e cuidador | Sim | Duração calculada |
| `occurrence` | map | Sim | Profissional | Intercorrência operacional | Sim | Descrição obrigatória exceto `none` |
| `evolutionId` | string/null | Não | Evolução | Referência clínica | Sim | Sem copiar conteúdo clínico |
| `created*`, `updated*` | Timestamp/string | Sim | Sistema | Autoria e tempo | Parcial | Criação imutável |

Visitas `completed`, `patient_absent` e `cancelled`, além de exclusões, são bloqueadas pelas Rules.
