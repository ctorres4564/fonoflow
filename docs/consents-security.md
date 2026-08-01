# Consentimentos e LGPD — segurança

- Auth Firebase obrigatório em todos os endpoints.
- `patientId`, profissional e organização são verificados ou derivados no backend.
- O cliente pode ler consentimentos somente quando é proprietário do paciente.
- Firestore Rules bloqueiam criação, alteração e exclusão diretas.
- Aceite, revogação, idempotência e auditoria usam transação backend.
- Hash SHA-256 referencia o termo, mas não substitui assinatura eletrônica.
- Logs guardam apenas operação, ator, paciente, consentimento, campos e `requestId`; não armazenam conteúdo clínico.
- Revogação não apaga o histórico.
- `consentOperations` não pode ser lida ou escrita pelo cliente.

Antes de uso jurídico em produção, os textos dos termos, bases legais e prazos de retenção devem ser aprovados pelo responsável jurídico/DPO da organização.
