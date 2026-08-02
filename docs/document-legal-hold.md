# Legal hold documental

Aplicação e remoção exigem proprietário autenticado, `requestId` idempotente e motivo, e são auditadas. Enquanto ativo, o documento não pode ser arquivado nem restaurado; o estado de retenção é `legal_hold`; arquivos e histórico permanecem preservados.

A remoção não apaga dados e apenas devolve o documento ao estado de retenção aplicável.

