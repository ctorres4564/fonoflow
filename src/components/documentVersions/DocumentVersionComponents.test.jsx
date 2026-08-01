import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import DocumentIntegrityBadge from './DocumentIntegrityBadge.jsx'
import DocumentRetentionBadge from './DocumentRetentionBadge.jsx'
import DocumentVersionCard from './DocumentVersionCard.jsx'
import LegalHoldBanner from './LegalHoldBanner.jsx'

describe('document version components', () => {
  it('distingue versão atual e integridade válida', () => {
    const html = renderToStaticMarkup(<DocumentVersionCard version={{
      id: 'v2', versionNumber: 2, status: 'current', changeReason: 'Correção fictícia',
      integrityStatus: 'valid', legacy: false,
    }} currentVersionId="v2" onDetails={() => {}} onRestore={() => {}} />)
    expect(html).toContain('Versão 2')
    expect(html).toContain('Integridade válida')
    expect(html).not.toContain('Restaurar')
  })

  it('comunica legal hold e retenção sem expor conteúdo clínico', () => {
    const html = renderToStaticMarkup(<><LegalHoldBanner active reason="Preservação jurídica" />
      <DocumentRetentionBadge status="legal_hold" /><DocumentIntegrityBadge status="invalid" /></>)
    expect(html).toContain('Legal hold ativo')
    expect(html).toContain('Preservação jurídica')
    expect(html).toContain('Integridade pendente ou inválida')
  })
})
