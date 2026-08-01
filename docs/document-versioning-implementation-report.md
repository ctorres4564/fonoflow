# Relatório de implementação — Etapa 6C

## Entregas

- schema estrito de versão e controles agregados;
- sequência transacional e idempotência;
- quarentena e destino isolados por versão;
- scan, promoção segura, SHA-256 e duplicidade no paciente;
- HMAC-SHA256 com falha fechada;
- listagem, detalhe, nova versão, restauração e verificação;
- retenção somente calculada e legal hold auditado;
- compatibilidade legada sem migração em leitura;
- interface mínima integrada aos detalhes do anexo;
- regras e testes automatizados.

`ClinicalDocument.file` permanece como projeção da corrente porque os fluxos 6A/6B dependem desse contrato. A fonte histórica é `versions`. Registros anteriores não recebem assinatura retroativa durante leitura.

## Validação final

| Comando | Resultado |
| --- | --- |
| `npm run lint` | aprovado; somente 3 avisos preexistentes fora da 6C |
| `npm run build` | aprovado; 268 módulos transformados |
| `npm test` | 36 arquivos e 345 testes aprovados |
| `npm run test:rules` | 62 testes aprovados no Firestore Emulator |
| `npm run test:storage` | 3 testes aprovados no Storage Emulator |
| `npm run test:emulator` | 6 testes transacionais aprovados |
| `git diff --check` | aprovado, sem erros de whitespace |

Também foram aprovados 34 testes direcionados dos workflows documental, de anexos e de versões após a persistência explícita dos estados de quarentena e scan. Total das suítes oficiais: 416 testes aprovados.

Todos os testes usam fixtures fictícias e emuladores `demo-fonoflow`.

Nenhuma funcionalidade 6D foi implementada. Não houve dados de produção, implantação, migração ou descarte documental.
