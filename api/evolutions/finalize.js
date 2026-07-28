import { authenticateEvolutionRequest, createEvolutionRepository } from '../_lib/evolutionFinalizeFirebase.js'
import { createEvolutionFinalizeHandler } from '../_lib/evolutionFinalizeHandler.js'

export default createEvolutionFinalizeHandler({
  authenticate: authenticateEvolutionRequest,
  repository: createEvolutionRepository(),
})
