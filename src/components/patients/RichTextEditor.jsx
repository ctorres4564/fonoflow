import { forwardRef, useEffect, useImperativeHandle } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { EMPTY_RICH_CONTENT, richContentToPlainText, sanitizeRichContent } from '../../utils/richContent'

const toolbarButtonBaseClass = 'rounded-lg border px-2.5 py-1 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40'
const toolbarButtonInactiveClass = 'border-noble-300 bg-white text-noble-700 hover:bg-noble-50 dark:border-noble-700 dark:bg-noble-800 dark:text-noble-200 dark:hover:bg-noble-750'
const toolbarButtonActiveClass = 'border-plum-500 bg-plum-100 text-plum-700 dark:border-plum-500 dark:bg-plum-900/40 dark:text-plum-200'

function ToolbarButton({ label, isActive = false, onClick, disabled = false }) {
  return (
    <button
      type="button"
      // Evita que o clique no botão tire o foco/seleção do editor antes do comando rodar.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={isActive}
      aria-label={label}
      title={label}
      className={`${toolbarButtonBaseClass} ${isActive ? toolbarButtonActiveClass : toolbarButtonInactiveClass}`}
    >
      {label}
    </button>
  )
}

// Editor de texto rico com esquema mínimo e fixo: negrito, itálico, subtítulo
// (título nível 3) e listas com marcadores/numeradas. Nenhuma outra extensão é
// habilitada — sem cores, fontes, imagens, tabelas ou links — para que o
// conteúdo salvo seja sempre seguro e prontuário-compatível.
const RichTextEditor = forwardRef(function RichTextEditor(
  { initialContent, onChange, placeholder = '', ariaLabel = 'Editor de evolução clínica', minHeightClass = 'min-h-36', id },
  ref,
) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        blockquote: false,
        code: false,
        codeBlock: false,
        strike: false,
        horizontalRule: false,
        link: false,
        underline: false,
        heading: { levels: [3] },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: initialContent && initialContent.type === 'doc' ? sanitizeRichContent(initialContent) : EMPTY_RICH_CONTENT,
    onUpdate: ({ editor: editorInstance }) => {
      const json = editorInstance.getJSON()
      onChange?.(json, richContentToPlainText(json))
    },
    editorProps: {
      attributes: {
        ...(id ? { id } : {}),
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': ariaLabel,
        class: 'clinical-rich-editor focus:outline-none',
      },
    },
  })

  useEffect(() => () => editor?.destroy(), [editor])

  useImperativeHandle(ref, () => ({
    getJSON: () => editor?.getJSON() ?? EMPTY_RICH_CONTENT,
    getPlainText: () => richContentToPlainText(editor?.getJSON() ?? EMPTY_RICH_CONTENT),
    setContent: (json) => {
      if (!editor) return
      const safeJson = sanitizeRichContent(json)
      editor.commands.setContent(safeJson)
      onChange?.(safeJson, richContentToPlainText(safeJson))
    },
    insertText: (text) => {
      if (!editor || !text) return
      editor.chain().focus('end').insertContent(text).run()
      const json = editor.getJSON()
      onChange?.(json, richContentToPlainText(json))
    },
    clear: () => {
      if (!editor) return
      editor.commands.setContent(EMPTY_RICH_CONTENT)
      onChange?.(EMPTY_RICH_CONTENT, '')
    },
    focus: () => editor?.commands.focus(),
    isEmpty: () => editor?.isEmpty ?? true,
  }), [editor, onChange])

  if (!editor) return null

  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label="Formatação do texto" className="flex flex-wrap gap-1.5">
        <ToolbarButton label="Negrito" isActive={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
        <ToolbarButton label="Itálico" isActive={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
        <ToolbarButton label="Subtítulo" isActive={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
        <ToolbarButton label="Lista com marcadores" isActive={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} />
        <ToolbarButton label="Lista numerada" isActive={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
        <ToolbarButton label="Limpar formatação" onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()} />
      </div>
      <EditorContent
        editor={editor}
        id={id ? `${id}-wrapper` : undefined}
        className={`w-full resize-y overflow-y-auto rounded-xl border border-noble-300 !bg-white px-4 py-3 text-sm leading-7 !text-black shadow-inner focus-within:outline-none focus-within:ring-2 focus-within:ring-plum-400 dark:border-noble-600 dark:!bg-noble-900 dark:!text-white ${minHeightClass}`}
      />
    </div>
  )
})

export default RichTextEditor
