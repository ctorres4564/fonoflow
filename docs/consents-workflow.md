# Consentimentos e LGPD — fluxo

## Registrar aceite

1. A interface apresenta finalidade, base legal, justificativa, versão e método.
2. O hash SHA-256 identifica a versão exata do termo.
3. `consentService.registerConsent()` envia Bearer Firebase e `requestId`.
4. O backend valida Zod, deriva profissional e organização, confirma propriedade do paciente e cria consentimento, operação idempotente e auditoria na mesma transação.
5. Um novo termo gera outro documento; versões anteriores nunca são sobrescritas.

## Validar

`await consentService.hasValidConsent(patientId, ConsentType)` chama o backend. A resposta considera somente consentimentos ativos, não revogados, e escolhe a maior versão. A consulta também gera auditoria com `requestId`.

## Revogar

`consentService.revokeConsent()` exige motivo e `requestId`. O backend preserva o documento, registra ator e data, marca `active: false` e cria auditoria na mesma transação. Exclusão é proibida.

## Limitações deliberadas

Não há assinatura ICP-Brasil, biometria, assinatura comercial, OCR ou upload de termo assinado. `acceptedEvidence` é evidência operacional, não certificado de assinatura.
