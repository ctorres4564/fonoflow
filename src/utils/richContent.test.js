import { describe, expect, it } from 'vitest'
import {
  buildEvolutionCreatePayload,
  isRichContentEmpty,
  plainTextToRichContent,
  richContentToPlainText,
  sanitizeRichContent,
} from './richContent.js'

describe('richContentToPlainText', () => {
  it('extrai parágrafos simples separados por linha em branco', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Primeira frase.' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Segunda frase.' }] },
      ],
    }
    expect(richContentToPlainText(doc)).toBe('Primeira frase.\n\nSegunda frase.')
  })

  it('extrai texto de negrito, itálico, subtítulo e listas', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Objetivos' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Paciente ' },
            { type: 'text', text: 'evoluiu bem', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' durante ' },
            { type: 'text', text: 'a sessão', marks: [{ type: 'italic' }] },
            { type: 'text', text: '.' },
          ],
        },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item 1' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item 2' }] }] },
          ],
        },
        {
          type: 'orderedList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Passo 1' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Passo 2' }] }] },
          ],
        },
      ],
    }
    const text = richContentToPlainText(doc)
    expect(text).toContain('Objetivos')
    expect(text).toContain('Paciente evoluiu bem durante a sessão.')
    expect(text).toContain('- Item 1')
    expect(text).toContain('- Item 2')
    expect(text).toContain('1. Passo 1')
    expect(text).toContain('2. Passo 2')
  })

  it('retorna string vazia para documento sem conteúdo', () => {
    expect(richContentToPlainText(null)).toBe('')
    expect(richContentToPlainText({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe('')
  })
})

describe('sanitizeRichContent', () => {
  it('mantém apenas negrito e itálico como marcas', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'texto', marks: [{ type: 'bold' }, { type: 'link', attrs: { href: 'https://evil.example' } }, { type: 'textStyle', attrs: { color: 'red' } }] },
          ],
        },
      ],
    }
    const clean = sanitizeRichContent(doc)
    expect(clean.content[0].content[0].marks).toEqual([{ type: 'bold' }])
  })

  it('descarta nós fora do esquema permitido (imagem, tabela, bloco de código)', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'image', attrs: { src: 'https://evil.example/x.png' } },
        { type: 'table', content: [{ type: 'tableRow', content: [] }] },
        { type: 'codeBlock', content: [{ type: 'text', text: 'rm -rf /' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'conteúdo legítimo' }] },
      ],
    }
    const clean = sanitizeRichContent(doc)
    expect(clean.content).toHaveLength(1)
    expect(clean.content[0]).toEqual({ type: 'paragraph', content: [{ type: 'text', text: 'conteúdo legítimo' }] })
  })

  it('nunca interpreta texto como HTML, mesmo contendo marcações perigosas', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '<img src=x onerror=alert(1)>' }] },
      ],
    }
    const clean = sanitizeRichContent(doc)
    expect(clean.content[0].content[0].text).toBe('<img src=x onerror=alert(1)>')
  })

  it('força o subtítulo sempre para o mesmo nível, ignorando outros níveis de título', () => {
    const doc = { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Título' }] }] }
    const clean = sanitizeRichContent(doc)
    expect(clean.content[0].attrs.level).toBe(3)
  })

  it('retorna documento vazio padrão para entrada inválida', () => {
    expect(sanitizeRichContent(null)).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] })
    expect(sanitizeRichContent('<script>alert(1)</script>')).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] })
  })
})

describe('plainTextToRichContent', () => {
  it('converte texto simples em parágrafos estruturados', () => {
    const doc = plainTextToRichContent('Primeira linha.\n\nSegunda linha.')
    expect(doc.type).toBe('doc')
    expect(doc.content).toHaveLength(2)
    expect(richContentToPlainText(doc)).toBe('Primeira linha.\n\nSegunda linha.')
  })

  it('retorna documento vazio para texto em branco', () => {
    expect(isRichContentEmpty(plainTextToRichContent('   '))).toBe(true)
  })
})

describe('buildEvolutionCreatePayload', () => {
  it('deriva notes a partir de richContent e inclui formatVersion e authorId', () => {
    const richContent = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Evoluiu bem.', marks: [{ type: 'bold' }] }] }],
    }
    const payload = buildEvolutionCreatePayload({
      date: '2026-07-28',
      duration: 50,
      richContent,
      authorId: 'professional-a',
      objectiveProgress: [{ objectiveId: 'obj-1', status: 'Em desenvolvimento' }],
    })

    expect(payload.notes).toBe('Evoluiu bem.')
    expect(payload.formatVersion).toBe(1)
    expect(payload.authorId).toBe('professional-a')
    expect(payload.richContent.content[0].content[0].marks).toEqual([{ type: 'bold' }])
    expect(payload.objectiveProgress).toEqual([{ objectiveId: 'obj-1', status: 'Em desenvolvimento' }])
  })

  it('sanitiza richContent perigoso antes de derivar notes', () => {
    const richContent = {
      type: 'doc',
      content: [
        { type: 'image', attrs: { src: 'x' } },
        { type: 'paragraph', content: [{ type: 'text', text: 'texto seguro' }] },
      ],
    }
    const payload = buildEvolutionCreatePayload({ date: '2026-07-28', duration: 50, richContent, authorId: 'a' })
    expect(payload.notes).toBe('texto seguro')
    expect(payload.richContent.content).toHaveLength(1)
  })
})
