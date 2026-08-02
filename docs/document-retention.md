# Retenção documental

Políticas backend-only ficam em `retentionPolicies/{policyId}` e definem duração, antecedência de revisão, evento inicial, categoria opcional e estado ativo.

A avaliação calcula `retentionUntil`, `retentionReviewAt` e um estado (`active`, `review_due`, `expired`, `legal_hold` ou `not_applicable`). O cálculo é auditado e nunca elimina, move ou anonimiza um documento automaticamente.

Prazo expirado significa revisão humana necessária. Qualquer descarte futuro exige etapa própria, autorização explícita e verificação de legal hold; não faz parte da 6C.

