import 'dotenv/config'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'

const configSchema = z.object({
  host: z.string(),
  port: z.number().int().positive(),
  publicUrl: z.string().url(),
  databaseUrl: z.string().min(1),
  accessToken: z.string().min(24),
  bridgeUrl: z.string().url(),
})

export type AppConfig = z.infer<typeof configSchema>

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const host = env.TOSS_MCP_HOST ?? '127.0.0.1'
  const port = Number(env.TOSS_MCP_PORT ?? 8787)
  const bridgeUrl = env.TOSS_MCP_BRIDGE_URL ?? `http://${host}:${port}`
  return configSchema.parse({
    host,
    port,
    publicUrl: env.TOSS_MCP_PUBLIC_URL ?? bridgeUrl,
    databaseUrl: env.TOSS_MCP_DATABASE_URL ?? 'sqlite:./data/toss-place.sqlite',
    accessToken: env.TOSS_MCP_ACCESS_TOKEN,
    bridgeUrl,
  })
}

export function generateSecret(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}
