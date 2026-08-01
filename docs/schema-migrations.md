# Migrações de schema

## V1 para V2

V1 é qualquer documento sem versão (e, no caso das evoluções históricas, o contrato preexistente que já usava `schemaVersion: 2`). V2 consolidado é produzido pelos conversores em `src/mappers`. A conversão preserva campos legados por merge e adiciona blocos canônicos; não exclui nada.

## Execução segura

Os comandos `migrate:*:dry` são o padrão e somente leem/validam. Eles exigem credenciais Firebase Admin e devem apontar primeiro ao emulador ou a um projeto local controlado. Opções: `--limit=N`, `--document=ID` e `--resume-after=ID`. Cada execução gera `migration-<entidade>-<timestamp>.json` com sucessos, falhas, ignorados e cursor de retomada.

Revise o projeto Firebase selecionado, o relatório e uma amostra dos documentos antes de qualquer escrita. A escrita requer simultaneamente `--execute --confirm-write`; os scripts do `package.json` incluem essa confirmação para tornar a intenção visível. Interrompa com Ctrl+C e retome usando o último `resumeAfter` do relatório.

## Reversão e limitações

A estratégia é aditiva: campos V1 não são removidos. A reversão operacional consiste em parar as escritas V2 e continuar lendo pelos normalizadores; remoções não fazem parte desta fase. Firestore não oferece rollback transacional de uma migração inteira, portanto exporte backup antes de execução real. Consultas `collectionGroup` podem exigir índice/permissão. Documentos inválidos são registrados individualmente e não interrompem o lote.

Nenhuma migração real é executada automaticamente pelo aplicativo ou por estes scripts.
