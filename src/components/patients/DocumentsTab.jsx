import { useEffect, useState, useRef } from 'react'
import toast from 'react-hot-toast'
import {
  subscribeDocuments,
  uploadDocument,
  getSecureDocumentDownload,
} from '../../services/documentService'

function DocumentsTab({ patient }) {
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [currentUploadingName, setCurrentUploadingName] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef(null)

  // Subscrever aos documentos do paciente
  useEffect(() => {
    if (!patient?.id) return

    setLoading(true)
    const unsubscribe = subscribeDocuments(
      patient.id,
      (data) => {
        setDocuments(data)
        setLoading(false)
      },
      (error) => {
        console.error('Erro ao buscar documentos:', error)
        toast.error('Erro ao carregar documentos do paciente.')
        setLoading(false)
      }
    )

    return () => unsubscribe()
  }, [patient?.id])

  // Função para formatar o tamanho dos arquivos
  const formatBytes = (bytes, decimals = 1) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
  }

  // Retorna o ícone SVG correspondente ao tipo do arquivo
  const getFileIcon = (fileType, fileName) => {
    const extension = fileName.split('.').pop().toLowerCase()
    
    // PDF
    if (fileType.includes('pdf') || extension === 'pdf') {
      return (
        <svg className="w-8 h-8 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
        </svg>
      )
    }
    
    // Imagens
    if (fileType.includes('image') || ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(extension)) {
      return (
        <svg className="w-8 h-8 text-emerald-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
        </svg>
      )
    }

    // Arquivos de texto
    if (fileType.includes('text') || ['txt', 'md'].includes(extension)) {
      return (
        <svg className="w-8 h-8 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 2h5v3h3v7H6V6z" clipRule="evenodd" />
        </svg>
      )
    }

    // Outros tipos (genérico)
    return (
      <svg className="w-8 h-8 text-noble-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 2h5v3h3v7H6V6z" clipRule="evenodd" />
      </svg>
    )
  }

  // Executa o upload do arquivo
  const handleFile = async (file) => {
    if (!file) return

    // Defesa de UX; os limites específicos e autoritativos ficam no backend.
    const MAX_SIZE = 200 * 1024 * 1024
    if (file.size > MAX_SIZE) {
      toast.error(`O arquivo excede o limite máximo. Tamanho do arquivo: ${formatBytes(file.size)}`)
      return
    }

    try {
      setUploading(true)
      setUploadProgress(0)
      setCurrentUploadingName(file.name)

      await uploadDocument(patient.id, file, (progress) => {
        setUploadProgress(progress)
      })

      toast.success('Documento processado pela verificação de segurança.')
    } catch (error) {
      console.error(error)
      toast.error('Ocorreu um erro ao fazer upload do documento.')
    } finally {
      setUploading(false)
      setUploadProgress(0)
      setCurrentUploadingName('')
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // Tratar alteração no input de arquivo
  const handleFileInputChange = (event) => {
    const file = event.target.files[0]
    handleFile(file)
  }

  // Tratar eventos de drag and drop
  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    handleFile(file)
  }

  const handleDownload = async (document) => {
    try {
      const result = await getSecureDocumentDownload(patient.id, document.id)
      window.open(result.downloadUrl, '_blank', 'noopener,noreferrer')
    } catch (error) {
      console.error(error)
      toast.error(error.message || 'Documento ainda não está liberado para download.')
    }
  }

  return (
    <div className="space-y-6 pb-6">
      <div>
        <h4 className="mb-1 text-base font-bold text-noble-800 dark:text-noble-100">Documentos e Anexos</h4>
        <p className="text-xs text-noble-500 dark:text-noble-400">
          Envie PDF, JPEG, PNG, MP3, WAV ou MP4. Todo arquivo passa por quarentena e verificação antes de ser liberado.
        </p>
      </div>

      {/* Área de Upload (Drag & Drop) */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-all duration-200 ${
          isDragging
            ? 'border-plum-600 bg-plum-50/20 dark:border-plum-500 dark:bg-noble-800/60'
            : 'border-noble-250 hover:border-plum-500 hover:bg-noble-50 dark:border-noble-700 dark:hover:border-plum-500 dark:hover:bg-noble-850'
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileInputChange}
          className="hidden"
          accept=".pdf,.png,.jpeg,.jpg,.mp3,.wav,.mp4,application/pdf,image/jpeg,image/png,audio/mpeg,audio/wav,video/mp4"
        />

        <div className="rounded-full bg-plum-50 dark:bg-plum-950/20 p-3 text-plum-600 dark:text-plum-400 mb-3">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>

        <p className="text-sm font-semibold text-noble-800 dark:text-noble-100">
          Arraste e solte o arquivo aqui, ou <span className="text-plum-600 dark:text-plum-400 underline">procure nos seus arquivos</span>
        </p>
        <p className="text-xs text-noble-500 dark:text-noble-400 mt-1">
          Limites: PDF 20MB, imagens 10MB, áudio 50MB e vídeo 200MB
        </p>
      </div>

      {/* Indicador de Progresso do Upload */}
      {uploading && (
        <div className="rounded-xl border border-noble-200 dark:border-noble-800 bg-white dark:bg-noble-900 p-4 shadow-sm space-y-2">
          <div className="flex justify-between items-center text-xs font-semibold text-noble-700 dark:text-noble-300">
            <span className="truncate max-w-[80%]">Enviando: {currentUploadingName}</span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-noble-100 dark:bg-noble-800 overflow-hidden">
            <div
              style={{ width: `${uploadProgress}%` }}
              className="h-full rounded-full bg-plum-600 dark:bg-plum-500 transition-all duration-200"
            />
          </div>
        </div>
      )}

      {/* Lista de Documentos */}
      <div className="space-y-3">
        <h5 className="text-xs font-bold text-noble-500 dark:text-noble-400 uppercase tracking-wider">
          Arquivos Anexados ({documents.length})
        </h5>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-plum-600 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm text-noble-500 dark:text-noble-400 ml-2">Carregando documentos...</span>
          </div>
        ) : documents.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between p-4 rounded-xl border border-noble-150 dark:border-noble-800 bg-white dark:bg-noble-900 hover:shadow-sm transition duration-200"
              >
                <div className="flex items-center space-x-3 overflow-hidden">
                  {getFileIcon(doc.type, doc.name)}
                  <div className="overflow-hidden">
                    <button
                      type="button"
                      onClick={() => handleDownload(doc)}
                      className="text-sm font-bold text-noble-800 dark:text-noble-100 hover:text-plum-600 dark:hover:text-plum-400 hover:underline truncate block"
                      title={doc.name}
                    >
                      {doc.name}
                    </button>
                    <div className="flex items-center space-x-2 text-[11px] text-noble-500 dark:text-noble-400 mt-0.5 font-medium">
                      <span>{formatBytes(doc.size)}</span>
                      <span>•</span>
                      <span>
                        {doc.createdAt
                          ? new Date(doc.createdAt).toLocaleDateString('pt-BR')
                          : 'Carregando...'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => handleDownload(doc)}
                    disabled={!doc.available}
                    className="p-1.5 rounded-lg text-noble-500 hover:text-noble-700 dark:text-noble-400 dark:hover:text-noble-200 hover:bg-noble-50 dark:hover:bg-noble-800 transition"
                    title={doc.available ? 'Download temporário' : `Indisponível: ${doc.status}`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-noble-150 dark:border-noble-800 bg-noble-50/50 dark:bg-noble-900/40 p-6 text-center">
            <svg className="w-10 h-10 text-noble-350 dark:text-noble-600 mx-auto mb-2" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <p className="text-sm font-semibold text-noble-700 dark:text-noble-300">Nenhum documento anexado</p>
            <p className="text-xs text-noble-500 dark:text-noble-400 mt-0.5">Faça upload de arquivos acima para vê-los listados aqui.</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default DocumentsTab
