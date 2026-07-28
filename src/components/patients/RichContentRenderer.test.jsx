import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import RichContentRenderer from './RichContentRenderer.jsx'

function render(props) {
  return renderToStaticMarkup(<RichContentRenderer {...props} />)
}

describe('RichContentRenderer — evoluções antigas (somente notes)', () => {
  it('renderiza uma evolução antiga sem richContent usando o texto simples', () => {
    const html = render({ plainText: 'Paciente compareceu à sessão e realizou os exercícios propostos.' })
    expect(html).toContain('Paciente compareceu à sessão e realizou os exercícios propostos.')
    expect(html).not.toContain('<strong>')
    expect(html).not.toContain('<h3>')
  })

  it('não renderiza nada quando não há conteúdo nem texto simples', () => {
    expect(render({})).toBe('')
  })

  it('escapa qualquer HTML presente no texto simples em vez de interpretá-lo', () => {
    const html = render({ plainText: '<img src=x onerror=alert(1)> <script>alert(1)</script>' })
    expect(html).not.toContain('<img src=x onerror=alert(1)>')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;img')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('RichContentRenderer — negrito, itálico, subtítulo e listas', () => {
  it('renderiza negrito e itálico como elementos semânticos', () => {
    const content = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Texto ' },
            { type: 'text', text: 'em negrito', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' e ' },
            { type: 'text', text: 'em itálico', marks: [{ type: 'italic' }] },
            { type: 'text', text: '.' },
          ],
        },
      ],
    }
    const html = render({ content })
    expect(html).toContain('<strong>em negrito</strong>')
    expect(html).toContain('<em>em itálico</em>')
  })

  it('renderiza subtítulo como h3', () => {
    const content = { type: 'doc', content: [{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Evolução do dia' }] }] }
    const html = render({ content })
    expect(html).toContain('<h3')
    expect(html).toContain('Evolução do dia')
    expect(html).toContain('</h3>')
  })

  it('renderiza lista com marcadores e lista numerada', () => {
    const content = {
      type: 'doc',
      content: [
        { type: 'bulletList', content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Marcador 1' }] }] },
        ] },
        { type: 'orderedList', content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Passo 1' }] }] },
        ] },
      ],
    }
    const html = render({ content })
    expect(html).toContain('<ul')
    expect(html).toContain('<ol')
    expect(html).toContain('Marcador 1')
    expect(html).toContain('Passo 1')
  })

  it('renderiza uma evolução completa combinando parágrafo, negrito, itálico, subtítulo e listas (equivalente à impressão)', () => {
    const content = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Resumo da sessão' }] },
        { type: 'paragraph', content: [
          { type: 'text', text: 'O paciente ' },
          { type: 'text', text: 'evoluiu bem', marks: [{ type: 'bold' }] },
          { type: 'text', text: '.' },
        ] },
        { type: 'bulletList', content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Trabalhou fonemas /r/ e /s/' }] }] },
        ] },
      ],
    }
    const html = render({ content, className: 'font-serif text-neutral-700' })
    expect(html).toContain('Resumo da sessão')
    expect(html).toContain('<strong>evoluiu bem</strong>')
    expect(html).toContain('Trabalhou fonemas /r/ e /s/')
  })
})

describe('RichContentRenderer — bloqueio de conteúdo inseguro', () => {
  it('ignora nós fora do esquema permitido (imagem, tabela) mesmo se presentes nos dados', () => {
    const content = {
      type: 'doc',
      content: [
        { type: 'image', attrs: { src: 'https://evil.example/x.png' } },
        { type: 'table', content: [{ type: 'tableRow', content: [] }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'conteúdo legítimo' }] },
      ],
    }
    const html = render({ content })
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<table')
    expect(html).toContain('conteúdo legítimo')
  })

  it('ignora marcas fora do esquema permitido (link, cor) mesmo se presentes nos dados', () => {
    const content = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'texto', marks: [{ type: 'link', attrs: { href: 'https://evil.example' } }, { type: 'textStyle', attrs: { color: 'red' } }] }],
        },
      ],
    }
    const html = render({ content })
    expect(html).not.toContain('<a ')
    expect(html).not.toContain('href=')
    expect(html).not.toContain('color')
  })
})
