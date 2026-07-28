import { isRichContentEmpty, sanitizeRichContent } from '../../utils/richContent'

// Renderizador seguro do conteúdo estruturado das evoluções clínicas.
// Nunca usa dangerouslySetInnerHTML: cada nó é convertido explicitamente em um
// elemento React da lista de tipos permitidos. Qualquer nó ou marca fora do
// esquema (imagens, tabelas, links, HTML digitado, cores) é ignorado.
function renderInlineChildren(nodes, keyPrefix) {
  return (nodes || []).map((node, index) => renderInlineNode(node, `${keyPrefix}-i${index}`))
}

function renderInlineNode(node, key) {
  if (!node || typeof node !== 'object') return null
  if (node.type === 'hardBreak') return <br key={key} />
  if (node.type !== 'text' || typeof node.text !== 'string') return null

  const marks = new Set((node.marks || []).map((mark) => mark?.type))
  let content = node.text
  if (marks.has('italic')) content = <em>{content}</em>
  if (marks.has('bold')) content = <strong>{content}</strong>
  return <span key={key}>{content}</span>
}

function renderListItemContent(blocks, keyPrefix) {
  return (blocks || []).map((block, index) => {
    const key = `${keyPrefix}-b${index}`
    if (block?.type === 'bulletList') {
      return <ul key={key} className="list-disc space-y-1 pl-5">{renderListItems(block.content, key)}</ul>
    }
    if (block?.type === 'orderedList') {
      return <ol key={key} className="list-decimal space-y-1 pl-5">{renderListItems(block.content, key)}</ol>
    }
    return <span key={key}>{renderInlineChildren(block?.content, key)}</span>
  })
}

function renderListItems(items, keyPrefix) {
  return (items || []).map((item, index) => (
    <li key={`${keyPrefix}-li${index}`}>{renderListItemContent(item?.content, `${keyPrefix}-li${index}`)}</li>
  ))
}

function renderBlockNode(node, key) {
  if (!node || typeof node !== 'object') return null
  switch (node.type) {
    case 'paragraph':
      return <p key={key} className="mb-2 last:mb-0">{renderInlineChildren(node.content, `${key}`) }</p>
    case 'heading':
      return <h3 key={key} className="mb-2 mt-3 text-base font-bold first:mt-0">{renderInlineChildren(node.content, `${key}`)}</h3>
    case 'bulletList':
      return <ul key={key} className="mb-2 list-disc space-y-1 pl-5">{renderListItems(node.content, `${key}`)}</ul>
    case 'orderedList':
      return <ol key={key} className="mb-2 list-decimal space-y-1 pl-5">{renderListItems(node.content, `${key}`)}</ol>
    default:
      return null
  }
}

// content: JSON estruturado (richContent) opcional.
// plainText: texto simples de compatibilidade, usado quando não há richContent
// (evoluções antigas) ou quando o conteúdo estruturado está vazio.
function RichContentRenderer({ content, plainText = '', className = '' }) {
  const doc = content && content.type === 'doc' ? sanitizeRichContent(content) : null
  const hasStructuredContent = doc && !isRichContentEmpty(doc)

  if (!hasStructuredContent) {
    if (!plainText) return null
    return (
      <div className={className}>
        <p className="whitespace-pre-wrap">{plainText}</p>
      </div>
    )
  }

  return (
    <div className={className}>
      {doc.content.map((node, index) => renderBlockNode(node, `n${index}`))}
    </div>
  )
}

export default RichContentRenderer
