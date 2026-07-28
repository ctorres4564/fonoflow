// Esquema mínimo e permitido para o conteúdo estruturado das evoluções clínicas.
// Qualquer nó ou marca fora desta lista é descartado por sanitizeRichContent,
// garantindo que negrito, itálico, subtítulo e listas sejam os únicos recursos
// de formatação persistidos (sem cores, imagens, tabelas, links ou HTML livre).
export const ALLOWED_NODE_TYPES = new Set([
  'doc',
  'paragraph',
  'text',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'hardBreak',
])

export const ALLOWED_MARK_TYPES = new Set(['bold', 'italic'])

export const SUBTITLE_HEADING_LEVEL = 3

export const EMPTY_RICH_CONTENT = { type: 'doc', content: [{ type: 'paragraph' }] }

function sanitizeNode(node) {
  if (!node || typeof node !== 'object' || typeof node.type !== 'string') return null
  if (!ALLOWED_NODE_TYPES.has(node.type)) return null

  if (node.type === 'text') {
    if (typeof node.text !== 'string' || node.text.length === 0) return null
    const clean = { type: 'text', text: node.text }
    if (Array.isArray(node.marks)) {
      const marks = node.marks
        .filter((mark) => mark && ALLOWED_MARK_TYPES.has(mark.type))
        .map((mark) => ({ type: mark.type }))
      if (marks.length > 0) clean.marks = marks
    }
    return clean
  }

  const clean = { type: node.type }
  if (node.type === 'heading') {
    clean.attrs = { level: SUBTITLE_HEADING_LEVEL }
  }
  if (Array.isArray(node.content)) {
    const content = node.content.map(sanitizeNode).filter(Boolean)
    if (content.length > 0) clean.content = content
  }
  return clean
}

// Remove qualquer estrutura fora do esquema permitido antes de persistir no Firestore.
// Aceita apenas JSON estruturado (nunca HTML) como entrada.
export function sanitizeRichContent(doc) {
  if (!doc || typeof doc !== 'object' || doc.type !== 'doc') {
    return structuredClone(EMPTY_RICH_CONTENT)
  }
  const content = Array.isArray(doc.content) ? doc.content.map(sanitizeNode).filter(Boolean) : []
  return { type: 'doc', content: content.length > 0 ? content : [{ type: 'paragraph' }] }
}

function extractText(node) {
  if (!node) return ''
  if (node.type === 'text') return node.text || ''
  if (node.type === 'hardBreak') return '\n'
  if (Array.isArray(node.content)) return node.content.map(extractText).join('')
  return ''
}

function listItemText(item) {
  return (item.content || [])
    .map((block) => (block.type === 'bulletList' || block.type === 'orderedList')
      ? blockToText(block)
      : extractText(block).trim())
    .join(' ')
    .trim()
}

function blockToText(node) {
  switch (node.type) {
    case 'paragraph':
    case 'heading':
      return extractText(node).trim()
    case 'bulletList':
      return (node.content || []).map((item) => `- ${listItemText(item)}`).join('\n')
    case 'orderedList': {
      let index = 0
      return (node.content || []).map((item) => {
        index += 1
        return `${index}. ${listItemText(item)}`
      }).join('\n')
    }
    default:
      return ''
  }
}

// Deriva o texto simples (para busca, IA e compatibilidade legada) a partir do
// JSON estruturado do editor. O texto simples nunca é a fonte de verdade — é
// sempre gerado a partir de richContent.
export function richContentToPlainText(doc) {
  if (!doc || !Array.isArray(doc.content)) return ''
  return doc.content
    .map(blockToText)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function isRichContentEmpty(doc) {
  return richContentToPlainText(doc).length === 0
}

// Converte texto simples (evoluções legadas, sugestões de IA aplicadas) em
// conteúdo estruturado seguro, preservando parágrafos e quebras de linha.
export function plainTextToRichContent(text) {
  const trimmed = (text || '').trim()
  if (!trimmed) return structuredClone(EMPTY_RICH_CONTENT)

  const paragraphs = trimmed.split(/\n{2,}/)
  const content = paragraphs.map((paragraph) => {
    const lines = paragraph.split('\n')
    const paragraphContent = []
    lines.forEach((line, index) => {
      if (index > 0) paragraphContent.push({ type: 'hardBreak' })
      if (line.length > 0) paragraphContent.push({ type: 'text', text: line })
    })
    return paragraphContent.length > 0 ? { type: 'paragraph', content: paragraphContent } : { type: 'paragraph' }
  })

  return { type: 'doc', content }
}

// Monta o payload de uma nova evolução clínica a partir do conteúdo do editor.
// notes é sempre derivado de richContent, nunca aceito como fonte independente.
export function buildEvolutionCreatePayload({ date, duration, richContent, authorId, objectiveProgress }) {
  const sanitized = sanitizeRichContent(richContent)
  const payload = {
    date,
    duration: Number(duration) || 50,
    notes: richContentToPlainText(sanitized),
    richContent: sanitized,
    formatVersion: 1,
    authorId,
  }
  if (objectiveProgress !== undefined) payload.objectiveProgress = objectiveProgress
  return payload
}
