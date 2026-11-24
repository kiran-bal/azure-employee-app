import { useEffect, useState } from 'react'
import * as api from './api'

export default function Documents({ employeeId }) {
  const [documents, setDocuments] = useState([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function loadDocuments() {
    try {
      setDocuments(await api.getDocuments(employeeId))
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    loadDocuments()
  }, [employeeId])

  async function handleUpload(event) {
    const file = event.target.files[0]
    if (!file) return
    setUploading(true)
    setError('')
    try {
      await api.uploadDocument(employeeId, file)
      await loadDocuments()
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  return (
    <div className="documents">
      {error && <p className="error">{error}</p>}

      {documents.length === 0 ? (
        <p className="empty">No documents uploaded.</p>
      ) : (
        <ul>
          {documents.map((doc) => (
            <li key={doc.name}>
              <a href={doc.url} target="_blank" rel="noreferrer">
                {doc.name}
              </a>
            </li>
          ))}
        </ul>
      )}

      <label className="upload">
        {uploading ? 'Uploading...' : 'Upload document'}
        <input type="file" onChange={handleUpload} disabled={uploading} />
      </label>
    </div>
  )
}
