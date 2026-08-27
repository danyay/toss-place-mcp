import type Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import type {
  ConnectionStatus,
  JsonRecord,
  MerchantSnapshot,
  OrderQuery,
  PendingCommand,
  SyncPayload,
  TossOrder,
} from './domain.js'
import { sha256 } from './security.js'

interface Row {
  [key: string]: unknown
}

interface Driver {
  dialect: 'sqlite' | 'postgres'
  exec(sql: string): Promise<void>
  run(sql: string, params?: unknown[]): Promise<void>
  get<T extends Row>(sql: string, params?: unknown[]): Promise<T | undefined>
  all<T extends Row>(sql: string, params?: unknown[]): Promise<T[]>
  close(): Promise<void>
}

class SqliteDriver implements Driver {
  readonly dialect = 'sqlite' as const
  private readonly database: Database.Database

  constructor(path: string, databaseConstructor: typeof Database) {
    const resolved = resolve(path)
    mkdirSync(dirname(resolved), { recursive: true })
    this.database = new databaseConstructor(resolved)
    this.database.pragma('journal_mode = WAL')
    this.database.pragma('foreign_keys = ON')
  }

  async exec(sql: string): Promise<void> {
    this.database.exec(sql)
  }

  async run(sql: string, params: unknown[] = []): Promise<void> {
    this.database.prepare(sql).run(...params)
  }

  async get<T extends Row>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return this.database.prepare(sql).get(...params) as T | undefined
  }

  async all<T extends Row>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.database.prepare(sql).all(...params) as T[]
  }

  async close(): Promise<void> {
    this.database.close()
  }
}

function postgresSql(sql: string): string {
  let index = 0
  return sql.replaceAll('?', () => `$${++index}`)
}

class PostgresDriver implements Driver {
  readonly dialect = 'postgres' as const
  private readonly pool: pg.Pool

  constructor(url: string) {
    this.pool = new pg.Pool({ connectionString: url })
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(sql)
  }

  async run(sql: string, params: unknown[] = []): Promise<void> {
    await this.pool.query(postgresSql(sql), params)
  }

  async get<T extends Row>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const result = await this.pool.query(postgresSql(sql), params)
    return result.rows[0] as T | undefined
  }

  async all<T extends Row>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.pool.query(postgresSql(sql), params)
    return result.rows as T[]
  }

  async close(): Promise<void> {
    await this.pool.end()
  }
}

function json(value: unknown): string {
  return JSON.stringify(value ?? null)
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function iso(value: unknown): string | null {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
    ? new Date(value).toISOString()
    : null
}

function merchantIdOf(payload: SyncPayload): string {
  return String(payload.merchant.id)
}

export class Store {
  private constructor(private readonly driver: Driver) {}

  static async open(databaseUrl: string): Promise<Store> {
    let driver: Driver
    if (databaseUrl.startsWith('postgresql://') || databaseUrl.startsWith('postgres://')) {
      driver = new PostgresDriver(databaseUrl)
    } else {
      try {
        const sqlite = await import('better-sqlite3')
        driver = new SqliteDriver(databaseUrl.replace(/^sqlite:/, ''), sqlite.default)
      } catch (error) {
        throw new Error(
          `SQLite support could not load. Reinstall better-sqlite3 with native build support or use PostgreSQL. ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        )
      }
    }
    const store = new Store(driver)
    await store.migrate()
    return store
  }

  private async migrate(): Promise<void> {
    const integer = this.driver.dialect === 'postgres' ? 'BIGINT' : 'INTEGER'
    await this.driver.exec(`
      CREATE TABLE IF NOT EXISTS connections (
        id TEXT PRIMARY KEY,
        merchant_id TEXT NOT NULL UNIQUE,
        merchant_name TEXT NOT NULL,
        secret TEXT NOT NULL,
        device_json TEXT NOT NULL,
        plugin_version TEXT,
        paired_at TEXT NOT NULL,
        last_seen_at TEXT
      );
      CREATE TABLE IF NOT EXISTS pairing_codes (
        code_hash TEXT PRIMARY KEY,
        expires_at ${integer} NOT NULL,
        created_at TEXT NOT NULL,
        consumed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS used_nonces (
        connection_id TEXT NOT NULL,
        nonce TEXT NOT NULL,
        expires_at ${integer} NOT NULL,
        PRIMARY KEY (connection_id, nonce)
      );
      CREATE TABLE IF NOT EXISTS merchant_snapshots (
        merchant_id TEXT PRIMARY KEY,
        merchant_json TEXT NOT NULL,
        device_json TEXT NOT NULL,
        categories_json TEXT NOT NULL,
        catalog_json TEXT NOT NULL,
        options_json TEXT NOT NULL,
        halls_json TEXT NOT NULL,
        tables_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS orders (
        merchant_id TEXT NOT NULL,
        order_id TEXT NOT NULL,
        order_state TEXT,
        payment_state TEXT,
        table_id ${integer},
        opened_at TEXT NOT NULL,
        updated_at TEXT,
        order_json TEXT NOT NULL,
        synced_at TEXT NOT NULL,
        PRIMARY KEY (merchant_id, order_id)
      );
      CREATE INDEX IF NOT EXISTS orders_merchant_opened_idx ON orders (merchant_id, opened_at);
      CREATE INDEX IF NOT EXISTS orders_state_idx ON orders (merchant_id, order_state, payment_state);
      CREATE TABLE IF NOT EXISTS commands (
        id TEXT PRIMARY KEY,
        connection_id TEXT NOT NULL,
        type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL,
        result_json TEXT,
        created_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS commands_pending_idx ON commands (connection_id, status, created_at);
    `)
  }

  async createPairingCode(code: string, expiresAt: number): Promise<void> {
    await this.driver.run(
      `INSERT INTO pairing_codes (code_hash, expires_at, created_at, consumed_at)
       VALUES (?, ?, ?, NULL)
       ON CONFLICT (code_hash) DO UPDATE SET expires_at = excluded.expires_at, created_at = excluded.created_at, consumed_at = NULL`,
      [sha256(code.toUpperCase()), expiresAt, new Date().toISOString()],
    )
  }

  async consumePairingCode(args: {
    code: string
    merchantId: string
    merchantName: string
    secret: string
    device: JsonRecord
    pluginVersion?: string
  }): Promise<string | null> {
    const codeHash = sha256(args.code.toUpperCase())
    const row = await this.driver.get<{ expires_at: number | string; consumed_at: string | null }>(
      'SELECT expires_at, consumed_at FROM pairing_codes WHERE code_hash = ?',
      [codeHash],
    )
    if (!row || row.consumed_at || Number(row.expires_at) < Date.now()) return null

    const now = new Date().toISOString()
    const connectionId = randomUUID()
    await this.driver.run('UPDATE pairing_codes SET consumed_at = ? WHERE code_hash = ?', [
      now,
      codeHash,
    ])
    await this.driver.run(
      `INSERT INTO connections
        (id, merchant_id, merchant_name, secret, device_json, plugin_version, paired_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (merchant_id) DO UPDATE SET
        id = excluded.id, merchant_name = excluded.merchant_name, secret = excluded.secret,
        device_json = excluded.device_json, plugin_version = excluded.plugin_version,
        paired_at = excluded.paired_at, last_seen_at = excluded.last_seen_at`,
      [
        connectionId,
        args.merchantId,
        args.merchantName,
        args.secret,
        json(args.device),
        args.pluginVersion ?? null,
        now,
        now,
      ],
    )
    return connectionId
  }

  async getConnectionSecret(connectionId: string): Promise<string | null> {
    const row = await this.driver.get<{ secret: string }>(
      'SELECT secret FROM connections WHERE id = ?',
      [connectionId],
    )
    return row?.secret ?? null
  }

  async useNonce(connectionId: string, nonce: string, expiresAt: number): Promise<boolean> {
    await this.driver.run('DELETE FROM used_nonces WHERE expires_at < ?', [Date.now()])
    const existing = await this.driver.get(
      'SELECT nonce FROM used_nonces WHERE connection_id = ? AND nonce = ?',
      [connectionId, nonce],
    )
    if (existing) return false
    await this.driver.run(
      'INSERT INTO used_nonces (connection_id, nonce, expires_at) VALUES (?, ?, ?)',
      [connectionId, nonce, expiresAt],
    )
    return true
  }

  async ingest(connectionId: string, payload: SyncPayload): Promise<void> {
    const merchantId = merchantIdOf(payload)
    const connection = await this.driver.get<{ merchant_id: string }>(
      'SELECT merchant_id FROM connections WHERE id = ?',
      [connectionId],
    )
    if (!connection || connection.merchant_id !== merchantId) {
      throw new Error('The signed connection does not match this merchant')
    }

    const now = payload.syncedAt ?? new Date().toISOString()
    await this.driver.run(
      `UPDATE connections SET merchant_name = ?, device_json = ?, plugin_version = ?, last_seen_at = ? WHERE id = ?`,
      [
        String(payload.merchant.name ?? merchantId),
        json(payload.device),
        payload.pluginVersion ?? null,
        now,
        connectionId,
      ],
    )

    if (payload.syncKind === 'snapshot') {
      await this.driver.run(
        `INSERT INTO merchant_snapshots
          (merchant_id, merchant_json, device_json, categories_json, catalog_json, options_json, halls_json, tables_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (merchant_id) DO UPDATE SET
          merchant_json = excluded.merchant_json, device_json = excluded.device_json,
          categories_json = excluded.categories_json, catalog_json = excluded.catalog_json,
          options_json = excluded.options_json, halls_json = excluded.halls_json,
          tables_json = excluded.tables_json, updated_at = excluded.updated_at`,
        [
          merchantId,
          json(payload.merchant),
          json(payload.device),
          json(payload.categories),
          json(payload.catalog),
          json(payload.options),
          json(payload.halls),
          json(payload.tables),
          now,
        ],
      )
    }

    for (const order of [...payload.orders, ...payload.orderEvents.map((entry) => entry.order)]) {
      await this.upsertOrder(merchantId, order, now)
    }
  }

  private async upsertOrder(merchantId: string, order: TossOrder, syncedAt: string): Promise<void> {
    const openedAt = iso(order.openedAt) ?? iso(order.createdAt) ?? syncedAt
    await this.driver.run(
      `INSERT INTO orders
        (merchant_id, order_id, order_state, payment_state, table_id, opened_at, updated_at, order_json, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (merchant_id, order_id) DO UPDATE SET
        order_state = excluded.order_state, payment_state = excluded.payment_state,
        table_id = excluded.table_id, opened_at = excluded.opened_at,
        updated_at = excluded.updated_at, order_json = excluded.order_json, synced_at = excluded.synced_at`,
      [
        merchantId,
        order.id,
        order.orderState ?? null,
        order.paymentState ?? null,
        order.tableId ?? null,
        openedAt,
        order.updatedAt ?? null,
        json(order),
        syncedAt,
      ],
    )
  }

  async getConnections(): Promise<ConnectionStatus[]> {
    const rows = await this.driver.all<{
      id: string
      merchant_id: string
      merchant_name: string
      device_json: string
      plugin_version: string | null
      paired_at: string
      last_seen_at: string | null
    }>(
      'SELECT id, merchant_id, merchant_name, device_json, plugin_version, paired_at, last_seen_at FROM connections ORDER BY paired_at',
    )
    const now = Date.now()
    return rows.map((row) => ({
      connectionId: row.id,
      merchantId: row.merchant_id,
      merchantName: row.merchant_name,
      device: parseJson<JsonRecord>(row.device_json, {}),
      pluginVersion: row.plugin_version,
      pairedAt: row.paired_at,
      lastSeenAt: row.last_seen_at,
      dataFreshnessSeconds: row.last_seen_at
        ? Math.max(0, Math.round((now - Date.parse(row.last_seen_at)) / 1000))
        : null,
    }))
  }

  async getSnapshot(merchantId?: string): Promise<MerchantSnapshot | null> {
    const row = merchantId
      ? await this.driver.get<Row>('SELECT * FROM merchant_snapshots WHERE merchant_id = ?', [
          merchantId,
        ])
      : await this.driver.get<Row>(
          'SELECT * FROM merchant_snapshots ORDER BY updated_at DESC LIMIT 1',
        )
    if (!row) return null
    return {
      merchantId: String(row.merchant_id),
      merchant: parseJson<JsonRecord>(row.merchant_json, {}),
      device: parseJson<JsonRecord>(row.device_json, {}),
      categories: parseJson<JsonRecord[]>(row.categories_json, []),
      catalog: parseJson<JsonRecord[]>(row.catalog_json, []),
      options: parseJson<JsonRecord[]>(row.options_json, []),
      halls: parseJson<JsonRecord[]>(row.halls_json, []),
      tables: parseJson<JsonRecord[]>(row.tables_json, []),
      updatedAt: String(row.updated_at),
    }
  }

  async listOrders(query: OrderQuery): Promise<TossOrder[]> {
    const clauses: string[] = []
    const params: unknown[] = []
    if (query.merchantId) {
      clauses.push('merchant_id = ?')
      params.push(query.merchantId)
    }
    if (query.start) {
      clauses.push('opened_at >= ?')
      params.push(query.start)
    }
    if (query.end) {
      clauses.push('opened_at <= ?')
      params.push(query.end)
    }
    if (query.tableId !== undefined) {
      clauses.push('table_id = ?')
      params.push(query.tableId)
    }
    if (query.orderStates?.length) {
      clauses.push(`order_state IN (${query.orderStates.map(() => '?').join(', ')})`)
      params.push(...query.orderStates)
    }
    if (query.paymentStates?.length) {
      clauses.push(`payment_state IN (${query.paymentStates.map(() => '?').join(', ')})`)
      params.push(...query.paymentStates)
    }
    const limit = Math.min(Math.max(query.limit ?? 500, 1), 5000)
    const offset = Math.max(query.offset ?? 0, 0)
    const rows = await this.driver.all<{ order_json: string }>(
      `SELECT order_json FROM orders ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
       ORDER BY opened_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    )
    return rows.map((row) => parseJson<TossOrder>(row.order_json, {} as TossOrder))
  }

  async getOrder(orderId: string, merchantId?: string): Promise<TossOrder | null> {
    const row = merchantId
      ? await this.driver.get<{ order_json: string }>(
          'SELECT order_json FROM orders WHERE order_id = ? AND merchant_id = ?',
          [orderId, merchantId],
        )
      : await this.driver.get<{ order_json: string }>(
          'SELECT order_json FROM orders WHERE order_id = ?',
          [orderId],
        )
    return row ? parseJson<TossOrder>(row.order_json, {} as TossOrder) : null
  }

  async queueSync(args: {
    merchantId?: string
    start?: string
    end?: string
  }): Promise<{ commandId: string; status: string }> {
    const connection = args.merchantId
      ? await this.driver.get<{ id: string }>('SELECT id FROM connections WHERE merchant_id = ?', [
          args.merchantId,
        ])
      : await this.driver.get<{ id: string }>(
          'SELECT id FROM connections ORDER BY paired_at LIMIT 1',
        )
    if (!connection) throw new Error('No paired Toss POS connection')
    const id = randomUUID()
    const type = args.start || args.end ? 'orders.sync' : 'snapshot.sync'
    await this.driver.run(
      `INSERT INTO commands (id, connection_id, type, payload_json, status, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
      [
        id,
        connection.id,
        type,
        json({ start: args.start, end: args.end }),
        new Date().toISOString(),
      ],
    )
    return { commandId: id, status: 'pending' }
  }

  async pendingCommands(connectionId: string): Promise<PendingCommand[]> {
    const rows = await this.driver.all<{
      id: string
      connection_id: string
      type: string
      payload_json: string
      created_at: string
    }>(
      `SELECT id, connection_id, type, payload_json, created_at FROM commands
       WHERE connection_id = ? AND status = 'pending' ORDER BY created_at LIMIT 20`,
      [connectionId],
    )
    return rows.map((row) => ({
      id: row.id,
      connectionId: row.connection_id,
      type: row.type as PendingCommand['type'],
      payload: parseJson<JsonRecord>(row.payload_json, {}),
      createdAt: row.created_at,
    }))
  }

  async completeCommand(
    connectionId: string,
    id: string,
    ok: boolean,
    result: unknown,
  ): Promise<void> {
    await this.driver.run(
      `UPDATE commands SET status = ?, result_json = ?, completed_at = ? WHERE id = ? AND connection_id = ?`,
      [ok ? 'completed' : 'failed', json(result), new Date().toISOString(), id, connectionId],
    )
  }

  async close(): Promise<void> {
    await this.driver.close()
  }
}
