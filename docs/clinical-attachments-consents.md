# Consentimentos dos anexos clínicos

Categorias com exigência:

| Categoria | Consentimento |
|---|---|
| `clinical_image` | `image` |
| `clinical_audio` | `audio` |
| `clinical_video` | `video` |

O frontend pode consultar `consentService.hasValidConsent()` para orientar a pessoa usuária, mas esse resultado não é confiável para autorização. O backend consulta os registros ativos e não revogados antes do rascunho, antes da URL de upload e antes da finalização.

O contexto persiste o ID e a versão validados, o instante e o resultado. Uma revogação entre upload e finalização bloqueia o arquivo. Revogação posterior não apaga anexo, referência nem histórico; decisões de uso futuro devem consultar a regra de negócio aplicável.

Consentimento específico não é tratado automaticamente como única base legal. A base legal permanece no registro de consentimento da Etapa 5. Logs de anexos não copiam justificativa, evidência, representante ou conteúdo do termo.
