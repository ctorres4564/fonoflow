import { z } from 'zod'
export const AI_PAYLOAD_LIMIT=16*1024
export const aiRequestSchema=z.object({prompt:z.string().trim().min(1).max(10000),systemInstruction:z.string().max(5000).optional()}).strict()
const monthlySchema=z.object({uid:z.string().min(1),month:z.string().regex(/^\d{4}-\d{2}$/),plan:z.string().min(1).max(30),count:z.number().int().nonnegative(),updatedAt:z.unknown()}).strict()
const minuteSchema=z.object({uid:z.string().min(1),minute:z.string().min(1).max(30),count:z.number().int().nonnegative(),expiresAt:z.date()}).strict()
export function parseAiRequest(body){let bytes;try{bytes=Buffer.byteLength(JSON.stringify(body),'utf8')}catch{throw new Error('INVALID_JSON')}if(bytes>AI_PAYLOAD_LIMIT)throw new Error('PAYLOAD_TOO_LARGE');return aiRequestSchema.parse(body)}
export const parseMonthlyQuotaWrite=(value)=>monthlySchema.parse(value)
export const parseMinuteQuotaWrite=(value)=>minuteSchema.parse(value)
