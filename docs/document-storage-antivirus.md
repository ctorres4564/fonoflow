# Integração antimalware

`MalwareScanner` define o contrato assíncrono `scan(input)`. A entrada inclui referência técnica, caminho no Storage, SHA-256, tamanho, MIME real e requestId. A saída controlada usa apenas `clean`, `infected` ou `failed`, provedor, versão, ameaça opcional, código e data.

`MockMalwareScanner` existe exclusivamente para testes, desenvolvimento controlado e emuladores. `FailClosedMalwareScanner` é o fallback seguro: retorna `failed`, nunca `clean`. Em `NODE_ENV=production`, configurar `mock` ou `always_clean` lança erro de inicialização.

O backend aplica timeout configurável. Exceção, timeout ou resposta desconhecida se convertem em falha; o documento termina `scan_failed`, permanece fora de `available` e não pode ser baixado.

Para integrar ClamAV, Cloud Run, worker assíncrono ou provedor aprovado, implemente a mesma interface, valide a autenticidade da resposta e mapeie resultados somente para os três estados aceitos. Não altere o fluxo de autorização nem permita bypass.

Pendências operacionais futuras: escolher o provedor real, definir SLA/retries, automatizar remoção segura de infectados e quarentenas expiradas, e criar observabilidade sem dados clínicos. Essas ações não foram executadas nesta etapa.
