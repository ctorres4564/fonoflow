export default function DocumentVersionUpload({ file, onFile, progress = 0, disabled }) {
  return <div className="space-y-2">
    <label className="block text-sm font-medium">Arquivo da nova versão
      <input type="file" required disabled={disabled} onChange={(event) => onFile(event.target.files?.[0] || null)}
        className="mt-1 block w-full rounded-lg border p-2" />
    </label>
    {file ? <p className="text-xs text-noble-500">{file.name} · {file.size} bytes</p> : null}
    {disabled ? <progress className="w-full" value={progress} max="100" aria-label="Progresso do upload" /> : null}
  </div>
}
