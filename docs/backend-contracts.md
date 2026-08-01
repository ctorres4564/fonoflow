# Contratos backend

## Auditoria Home Care

`POST /api/audit` aceita os eventos `HOME_CARE_VISIT_CREATED`, `HOME_CARE_DEPARTURE_RECORDED`, `HOME_CARE_ARRIVAL_RECORDED`, `HOME_CARE_SERVICE_STARTED`, `HOME_CARE_VISIT_COMPLETED`, `HOME_CARE_PATIENT_ABSENT`, `HOME_CARE_VISIT_CANCELLED`, `HOME_CARE_OCCURRENCE_RECORDED` e `HOME_CARE_TRAVEL_UPDATED`. O backend deriva o ator do token, valida a propriedade do paciente e não aceita endereço completo, localização precisa ou conteúdo clínico.

| Rota | AutenticaÃ§Ã£o | Schema de entrada | Campos protegidos | OperaÃ§Ã£o idempotente | Auditoria |
|---|---|---|---|---|---|
| `POST /api/evolutions/finalize` | Bearer Firebase | contrato estrito + `parseEvolutionFinalize` | ator, autoria e timestamps derivados | sim, `Idempotency-Key` UUID | mesma transaÃ§Ã£o, sem conteÃºdo integral |
| `POST /api/audit` | Bearer Firebase | `auditPostSchema.strict()`, 16 KiB | `actorId`, e-mail, origem e timestamp | n/a | cria o evento |
| `GET /api/audit` | Bearer Firebase | `auditGetSchema.strict()`, limite 1â€“200 | consulta forÃ§ada ao `uid` | leitura | n/a |
| `POST /api/gemini` | Bearer Firebase | `aiRequestSchema.strict()`, 16 KiB; `prompt` 10.000 e instruÃ§Ã£o 5.000 caracteres | identidade e cotas derivadas; `userId` rejeitado | cota transacional validada por Zod | nÃ£o persiste prontuÃ¡rio |

Erros pÃºblicos nÃ£o incluem stack. Logs registram somente cÃ³digo ou nome do erro, nunca o payload clÃ­nico integral.
