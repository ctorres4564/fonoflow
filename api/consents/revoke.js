import { createConsentRepository,authenticateConsentRequest } from '../_lib/consentFirebase.js'
import { createConsentHandler } from '../_lib/consentHandler.js'
import { revokeConsent } from '../_lib/consentWorkflow.js'
export default createConsentHandler({authenticate:authenticateConsentRequest,repository:createConsentRepository(),operation:revokeConsent})
