import { listDocumentVersions } from '../../../_lib/documentVersionWorkflow.js'
import { versionHandler } from '../../../_lib/documentVersionEndpoint.js'

export default versionHandler(listDocumentVersions, { method: 'GET' })
