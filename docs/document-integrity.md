# Integridade documental

Versões novas recebem `metadataHash` SHA-256 e assinatura `HMAC-SHA256`. A carga canônica inclui identidades, sequência, vínculos históricos, motivo, metadados do arquivo, scan e autor. A chave backend-only `DOCUMENT_INTEGRITY_HMAC_KEY` exige no mínimo 32 bytes e tem versão independente.

Produção sem chave válida falha durante a inicialização do endpoint. Chaves de exemplo são rejeitadas. A chave e a assinatura integral não aparecem em logs.

`POST /api/documents/:documentId/integrity/verify` compara hash atual do objeto, SHA persistido, hash canônico e HMAC por comparação em tempo constante. Divergência cria um `integrityCheck`, marca a versão `compromised`, define `integrityBlocked` no documento corrente e bloqueia download. A checagem não corrige nem reescreve conteúdo.

