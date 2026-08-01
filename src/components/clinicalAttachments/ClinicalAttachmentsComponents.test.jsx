import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ClinicalAttachmentCard from './ClinicalAttachmentCard.jsx'
import ClinicalAttachmentConsentAlert from './ClinicalAttachmentConsentAlert.jsx'
import ClinicalAttachmentDetailsDialog from './ClinicalAttachmentDetailsDialog.jsx'
import ClinicalAttachmentList from './ClinicalAttachmentList.jsx'
import ClinicalAttachmentStatusBadge from './ClinicalAttachmentStatusBadge.jsx'
import ClinicalAttachmentUploadDialog from './ClinicalAttachmentUploadDialog.jsx'

const attachment = {
  id: 'attachment-a',
  title: 'Audiometria tonal',
  fileName: 'audiometria.pdf',
  size: 2048,
  category: 'audiometry',
  status: 'available',
  available: true,
  documentDate: '2026-08-01',
  description: 'Documento fictício',
}

describe('clinical attachment interface', () => {
  it('exibe estados compreensíveis sem detalhe técnico do scanner', () => {
    const html = renderToStaticMarkup(<div>
      <ClinicalAttachmentStatusBadge status="scanning" />
      <ClinicalAttachmentStatusBadge status="blocked" />
      <ClinicalAttachmentStatusBadge status="scan_failed" />
    </div>)
    expect(html).toContain('Em análise de segurança')
    expect(html).toContain('Bloqueado')
    expect(html).toContain('Falha na verificação')
    expect(html).not.toContain('threatName')
  })

  it('lista categoria e download somente para disponível', () => {
    const available = renderToStaticMarkup(<ClinicalAttachmentCard
      attachment={attachment} onDetails={() => {}} onDownload={() => {}}
    />)
    const blocked = renderToStaticMarkup(<ClinicalAttachmentCard
      attachment={{ ...attachment, status: 'blocked', available: false }}
      onDetails={() => {}} onDownload={() => {}}
    />)
    expect(available).toContain('Audiometria')
    expect(available).toContain('Baixar')
    expect(blocked).not.toContain('Baixar')
    expect(blocked).not.toContain('storagePath')
  })

  it('apresenta carregamento, erro e estado vazio acessíveis', () => {
    expect(renderToStaticMarkup(<ClinicalAttachmentList attachments={[]} loading />)).toContain('Carregando anexos')
    expect(renderToStaticMarkup(<ClinicalAttachmentList attachments={[]} error="Falha controlada" />)).toContain('role="alert"')
    expect(renderToStaticMarkup(<ClinicalAttachmentList attachments={[]} />)).toContain('Nenhum anexo clínico')
  })

  it('mostra alerta de consentimento para mídia clínica', () => {
    const html = renderToStaticMarkup(<ClinicalAttachmentConsentAlert
      category="clinical_video" validation={{ valid: false }}
    />)
    expect(html).toContain('Consentimento válido para vídeo')
    expect(html).toContain('role="alert"')
  })

  it('dialog de upload é teclado-acessível, responsivo e não permite múltiplos arquivos', () => {
    const html = renderToStaticMarkup(<ClinicalAttachmentUploadDialog
      open onClose={() => {}} onSubmit={() => {}}
      options={{ evolutions: [], appointments: [] }}
      validateConsent={() => ({ valid: true })}
      uploading={false} progress={0}
    />)
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('max-w-2xl')
    expect(html).toContain('type="file"')
    expect(html).not.toContain('multiple=""')
  })

  it('arquivamento exige confirmação e não oferece ação para legado', () => {
    const current = renderToStaticMarkup(<ClinicalAttachmentDetailsDialog
      attachment={attachment} onClose={() => {}} onArchive={() => {}}
    />)
    const legacy = renderToStaticMarkup(<ClinicalAttachmentDetailsDialog
      attachment={{ ...attachment, legacy: true }} onClose={() => {}} onArchive={() => {}}
    />)
    expect(current).toContain('Arquivar')
    expect(legacy).not.toContain('Arquivar')
  })
})
