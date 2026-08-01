# Consentimentos e LGPD — modelo de dados

## Persistência

Cada aceite é um documento imutável e versionado em:

`patients/{patientId}/consents/{consentId}`

Revogações não apagam o aceite: apenas acrescentam `revoked`, `revokedAt`, `revokedReason`, `revokedBy`, atualizam `active` e preservam todo o restante. Repetições são controladas em `consentOperations/{requestId}`, coleção exclusiva do backend.

| Campo | Tipo | Origem | Finalidade | Mutável |
|---|---|---|---|---|
| `schemaVersion` | literal `2` | Backend | Versão do contrato | Não |
| `patientId` | string | Rota/paciente | Titular do consentimento | Não |
| `organizationId` | string | Paciente ou profissional | Contexto controlador | Não |
| `professionalId` | string | Token | Profissional responsável | Não |
| `consentType` | enum/string namespaced | Solicitação validada | Finalidade autorizada | Não |
| `legalBasis` | objeto | Solicitação validada | Base legal e justificativa | Não |
| `version` | objeto | Termo exibido | Número, título e SHA-256 | Não |
| `title`, `hash` | string | Versão | Referência exata ao termo | Não |
| `acceptedAt`, `acceptedBy` | Timestamp/string | Backend/token | Momento e ator | Não |
| `acceptedMethod` | enum | Fluxo | Forma de registro | Não |
| `acceptedEvidence` | objeto | Fluxo | Evidência mínima | Não |
| `revoked*` | campos de revogação | Backend | Retirada auditável | Sim, uma vez |
| `active` | boolean | Backend | Consulta rápida de validade | Sim, na revogação |
| `createdAt`, `updatedAt` | Timestamp | Backend | Controle temporal | Parcial |

## Tipos e bases legais

Os tipos conhecidos incluem atendimento, prontuário, privacidade, comunicação, documentos, imagem, vídeo, áudio, teleatendimento, IA, pesquisa e compartilhamento. Extensões usam `custom:nome_da_finalidade`, evitando valores livres ambíguos.

Bases legais são estruturadas e não presumem consentimento: consentimento, contrato, obrigação legal, tutela da saúde, proteção da vida, legítimo interesse e exercício regular de direitos.

## Compatibilidade

O campo legado `tcleAccepted` é convertido somente em memória para um registro `legacy-tcle`. Nenhuma leitura persiste ou inventa um novo aceite jurídico. Novos registros sempre usam Schema V2 e o backend.
