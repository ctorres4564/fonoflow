# Segurança e privacidade do Home Care

- Somente o proprietário autenticado do agendamento acessa a visita.
- Identificadores, proprietário, autor e criação são imutáveis.
- Estados seguem matriz fechada; visitas encerradas não podem ser alteradas ou excluídas.
- A agenda, a visita, o saldo e o histórico são alterados na mesma transação central; o módulo não cria débito paralelo.
- Auditoria registra metadados mínimos, sem endereço completo, localização precisa ou conteúdo clínico.
- Navegação usa apenas o endereço textual. Não existe rastreamento contínuo ou em segundo plano.
- Intercorrências clínicas detalhadas pertencem à evolução, não ao registro operacional.
- Correções após encerramento exigem futuro adendo operacional auditado.

As Rules validam autenticação, propriedade, estrutura crítica, IDs, estados e imutabilidade. A validação detalhada permanece nos parsers Zod.
