# Restauração de versões

Restauração não altera a versão escolhida. Após validar proprietário, consentimento, vínculo clínico, scan, arquivo e assinatura, o backend cria uma nova versão corrente que aponta a origem em `supersedesVersionId`.

A versão antes corrente passa a `superseded`; a origem histórica permanece inalterada. A operação é transacional, idempotente e auditada. Versões legadas sem assinatura, comprometidas, infectadas ou sob legal hold não são restauráveis.

