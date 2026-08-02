import { z } from 'zod'

export const nullableText = (max = 500) => z.string().trim().max(max).nullable().optional()
export const nonEmptyTextArray = (maxItems = 50, maxLength = 300) => z.array(z.string().trim().min(1).max(maxLength)).max(maxItems).optional()
export const timestampSchema = z.unknown().refine((value) => value !== undefined && value !== null, 'Timestamp obrigatório')
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve usar YYYY-MM-DD')
export const removeUndefined = (value) => {
  if (Array.isArray(value)) return value.map(removeUndefined)
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, removeUndefined(item)]))
  }
  return value
}
