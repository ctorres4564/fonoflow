# Relatório de implementação — Etapa 5: Consentimentos e LGPD

**Data:** 1º de agosto de 2026

## Resultado

O módulo de Consentimentos e LGPD foi implementado de forma incremental. Consentimentos são versionados, nunca excluídos, aceitos e revogados exclusivamente pelo backend e consultáveis por um serviço central reutilizável.

O projeto usa JavaScript; por isso, `consentService.js` e tipos JSDoc seguem a arquitetura existente sem introduzir uma migração isolada para TypeScript.

## Arquivos criados

### Domínio, serviço e interface

- `src/schemas/consent.schema.js`
- `src/schemas/consent.schema.test.js`
- `src/types/consent.types.js`
- `src/services/consentService.js`
- `src/components/consents/ConsentStatus.jsx`
- `src/components/consents/ConsentBadge.jsx`
- `src/components/consents/ConsentCard.jsx`
- `src/components/consents/ConsentTimeline.jsx`
- `src/components/consents/ConsentHistory.jsx`
- `src/components/consents/ConsentDialog.jsx`
- `src/components/consents/ConsentsTab.jsx`
- `src/components/consents/ConsentComponents.test.jsx`

### Backend

- `api/_lib/consentFirebase.js`
- `api/_lib/consentWorkflow.js`
- `api/_lib/consentWorkflow.test.js`
- `api/_lib/consentHandler.js`
- `api/_lib/consentHandler.test.js`
- `api/consents/register.js`
- `api/consents/revoke.js`
- `api/consents/validate.js`

### Documentação

- `docs/consents-data-model.md`
- `docs/consents-workflow.md`
- `docs/consents-security.md`
- `docs/consents-implementation-report.md`

## Arquivos modificados

- `src/components/patients/EvolutionModal.jsx`: nova aba Consentimentos.
- `src/schemas/index.js`: exportação dos contratos.
- `api/_lib/auditValidation.js`: eventos LGPD reconhecidos.
- `firestore.rules`: leitura pelo proprietário e escrita exclusivamente backend.
- `tests/firestore.rules.test.js`: segurança de consentimentos e idempotência.
- `docs/data-model.md`: referência ao novo modelo.
- `docs/backend-contracts.md`: contratos das três rotas.

## Estrutura do banco

```text
patients/{patientId}/consents/{consentId}
  schemaVersion: 2
  patientId
  organizationId
  professionalId
  consentType
  legalBasis { code, justification }
  version { number, title, hash }
  title
  hash
  acceptedAt
  acceptedBy
  acceptedMethod
  acceptedEvidence
  revoked
  revokedAt
  revokedReason
  revokedBy
  active
  createdAt
  updatedAt

consentOperations/{requestId}       # backend-only/idempotência
auditLogs/{auditId}                 # backend-only/auditoria
```

Cada aceite cria um documento novo. Revogação atualiza somente o estado de revogação; não apaga nem substitui a versão aceita.

## Fluxo completo

1. A aba Consentimentos carrega a subcoleção pelo `consentService`.
2. Um TCLE legado V1 pode ser exibido virtualmente, somente para leitura.
3. Novo aceite coleta finalidade, base legal, justificativa, versão, método e evidência mínima.
4. O cliente calcula o SHA-256 da referência da versão e envia a solicitação autenticada.
5. O backend valida Zod, confirma propriedade, deriva ator/organização e cria consentimento, auditoria e idempotência na mesma transação.
6. `hasValidConsent(patientId, consentType)` consulta o backend, seleciona a maior versão ativa e gera auditoria.
7. Revogação exige motivo, preserva o aceite e registra ator, data, `requestId` e auditoria.

## Testes adicionados

- 4 testes de schema: tipos conhecidos/futuros, hash/base legal, coerência de revogação e legado V1.
- 4 testes de workflow: registro idempotente, revogação, maior versão válida, autorização.
- 2 testes do handler: método/autenticação e identidade derivada.
- 2 testes de componentes: status/conteúdo mínimo e estado vazio.
- 3 testes de Rules: leitura autorizada, escrita/revogação/exclusão bloqueadas e operações protegidas.

Total novo: 15 testes.

## Validação e cobertura alcançada

| Comando | Resultado |
|---|---|
| `npm run lint` | Aprovado; 3 warnings preexistentes, nenhum erro |
| `npm run build` | Aprovado; 248 módulos transformados |
| `npm test` | 24 arquivos, 274/274 testes aprovados |
| `npm run test:rules` | 56/56 testes aprovados |
| `npm run test:emulator` | 6/6 testes aprovados |
| `git diff --check` | Aprovado |

A configuração atual não gera percentual de cobertura, portanto nenhum número artificial é declarado. A cobertura funcional adicionada inclui schema, compatibilidade V1/V2, backend, idempotência, versionamento, revogação, consulta, auditoria, interface e Firestore Rules.

## Segurança e limitações

- Escritas diretas pelo frontend são proibidas.
- Identidade, organização e timestamps são derivados no backend.
- Histórico não pode ser excluído.
- O hash identifica uma versão, mas não é assinatura digital.
- Não foram implementados ICP-Brasil, biometria, assinatura comercial, OCR ou upload de termo assinado.
- Textos jurídicos e políticas de retenção ainda devem ser aprovados pelo DPO/responsável jurídico antes de uso produtivo.

## Melhorias recomendadas para a próxima etapa

Para Gestão Documental e Firebase Storage, sem implementação nesta etapa:

1. criar catálogo imutável de documentos/termos publicados, com hash gerado no backend;
2. associar consentimentos ao identificador da versão documental, além do hash;
3. aplicar caminhos de Storage isolados por organização e paciente;
4. validar MIME, tamanho, extensão e antivírus antes da disponibilização;
5. usar URLs temporárias e evitar links públicos permanentes;
6. definir retenção, descarte e legal hold por classe documental;
7. registrar auditoria de upload, leitura, download e exclusão lógica;
8. preparar integração futura de assinatura sem tratá-la como aceite simples.

Nenhuma implantação, migração ou gravação em produção foi executada.
