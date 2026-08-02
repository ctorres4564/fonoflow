import { describe, expect, it } from 'vitest'
import { detectMime, inspectFile, sha256 } from './fileInspection'

const pdf = Buffer.from('%PDF-1.7 arquivo fictício')

describe('file inspection', () => {
  it('detecta assinatura e calcula SHA-256', () => {
    expect(detectMime(pdf)).toBe('application/pdf')
    expect(sha256(pdf)).toMatch(/^[a-f0-9]{64}$/)
  })

  it.each([
    ['image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0x00])],
    ['image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ['audio/mpeg', Buffer.from('ID3x')],
    ['audio/wav', Buffer.from('RIFF0000WAVE')],
    ['video/mp4', Buffer.from('0000ftypisom')],
  ])('detecta magic bytes de %s', (mime, buffer) => {
    expect(detectMime(buffer)).toBe(mime)
  })

  it('não confunde contêiner HEIC com MP4', () => {
    expect(detectMime(Buffer.from('0000ftypheic'))).toBeNull()
  })

  it('rejeita spoofing de MIME e tamanho', () => {
    expect(() => inspectFile({
      buffer: pdf,
      originalFileName: 'arquivo.pdf',
      declaredMimeType: 'image/png',
      declaredSize: pdf.length,
    })).toThrow()
    expect(() => inspectFile({
      buffer: pdf,
      originalFileName: 'arquivo.pdf',
      declaredMimeType: 'application/pdf',
      declaredSize: 1,
    })).toThrow()
  })

  it('rejeita conteúdo desconhecido', () => {
    expect(() => inspectFile({
      buffer: Buffer.from('malware'),
      originalFileName: 'arquivo.pdf',
      declaredMimeType: 'application/pdf',
      declaredSize: 7,
    })).toThrow()
  })
})
