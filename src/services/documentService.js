import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore'
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytesResumable,
} from 'firebase/storage'
import { db } from '../firebase/config'
import { storage } from '../firebase/storage'

// Retorna a coleção de documentos de um determinado paciente
const getDocumentsCollection = (patientId) => collection(db, 'patients', patientId, 'documents')

/**
 * Inscreve-se reativamente na lista de documentos de um paciente específico.
 * @param {string} patientId - ID do paciente.
 * @param {function} callback - Callback executada quando os dados mudam.
 * @param {function} onError - Callback executada em caso de erro.
 * @returns {function} Função de desinscrição do snapshot do Firestore.
 */
export function subscribeDocuments(patientId, callback, onError) {
  const coll = getDocumentsCollection(patientId)

  return onSnapshot(
    coll,
    (snapshot) => {
      const documents = snapshot.docs
        .map((documentDoc) => ({
          id: documentDoc.id,
          ...documentDoc.data(),
        }))
        .sort((a, b) => {
          const aTime = a.createdAt?.seconds || 0
          const bTime = b.createdAt?.seconds || 0
          return bTime - aTime // Ordena decrescente por data de criação
        })
      callback(documents)
    },
    onError,
  )
}

/**
 * Faz upload do arquivo para o Firebase Storage e cria o registro correspondente no Firestore.
 * @param {string} patientId - ID do paciente associado.
 * @param {File} file - Arquivo a ser enviado.
 * @param {function} onProgress - Callback opcional para progresso do upload (recebe valor de 0 a 100).
 * @returns {Promise<object>} Objeto com dados do documento criado.
 */
export function uploadDocument(patientId, file, onProgress) {
  return new Promise((resolve, reject) => {
    try {
      const timestamp = Date.now()
      // Remove caracteres especiais para evitar problemas no Storage
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
      const storagePath = `patients/${patientId}/${timestamp}_${sanitizedName}`
      const storageRef = ref(storage, storagePath)

      const uploadTask = uploadBytesResumable(storageRef, file)

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100
          if (onProgress) {
            onProgress(Math.round(progress))
          }
        },
        (error) => {
          console.error('Erro no upload para o Storage:', error)
          reject(error)
        },
        async () => {
          try {
            const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref)

            const docData = {
              name: file.name,
              url: downloadUrl,
              type: file.type || 'application/octet-stream',
              size: file.size,
              storagePath: storagePath,
              createdAt: serverTimestamp(),
            }

            const docRef = await addDoc(getDocumentsCollection(patientId), docData)
            resolve({ id: docRef.id, ...docData })
          } catch (firestoreError) {
            console.error('Erro ao salvar metadados no Firestore:', firestoreError)
            reject(firestoreError)
          }
        },
      )
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Exclui a referência no Firestore e o arquivo físico correspondente no Firebase Storage.
 * @param {string} patientId - ID do paciente.
 * @param {string} docId - ID do documento no Firestore.
 * @param {string} storagePath - Caminho do arquivo no Firebase Storage.
 * @returns {Promise<void>}
 */
export async function deleteDocument(patientId, docId, storagePath) {
  // 1. Remove o registro no Firestore
  await deleteDoc(doc(db, 'patients', patientId, 'documents', docId))

  // 2. Remove o arquivo físico no Firebase Storage
  if (storagePath) {
    try {
      const storageRef = ref(storage, storagePath)
      await deleteObject(storageRef)
    } catch (storageError) {
      // Caso o arquivo físico não seja encontrado por algum motivo, não interrompemos o fluxo
      console.warn('Arquivo físico não encontrado ou falha ao remover do Storage:', storageError)
    }
  }
}
