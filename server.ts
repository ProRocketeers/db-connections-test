import { Elysia, t } from 'elysia'
import { swagger } from '@elysiajs/swagger'
import pg from 'pg'
import Redis from 'ioredis'

console.log('Environment variables:')
console.log('DB_HOST:', process.env.DB_HOST)
console.log('DB_PORT:', process.env.DB_PORT)
console.log('DB_NAME:', process.env.DB_NAME)
console.log('DB_USER:', process.env.DB_USER)
console.log('DB_PASSWORD:', process.env.DB_PASSWORD ? '***' : undefined)
if (process.env.DB_URL) {
  const url = process.env.DB_URL
  const start = url.slice(0, 12)
  const end = url.slice(-20)
  const masked = `${start}...${end}`
  console.log('DB_URL:', masked)
}else{
  console.log('NO DB_URL FOUND')
}
console.log('REDIS_HOST:', process.env.REDIS_HOST)
console.log('REDIS_PORT:', process.env.REDIS_PORT)

const { Pool } = pg


const pool = new Pool({
  connectionString: process.env.DB_URL
})

pool.on('error', (err) => {
  console.error('[DEBUG] PostgreSQL pool error:', err.message, 'code:', err.code)
})

pool.on('connect', (client) => {
  console.log('[DEBUG] PostgreSQL client connected')
})

console.log('[DEBUG] PostgreSQL pool created successfully')
console.log('[DEBUG] Attempting to create todos table...')

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS todos (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      completed BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `)
  console.log('[DEBUG] Todos table created or already exists')
} catch (err) {
  console.error('[DEBUG] Failed to create todos table:', err.message, 'code:', err.code)
  console.error('[DEBUG] Error stack:', err.stack)
  throw err
}

console.log('[DEBUG] PostgreSQL connection established and initialized')
console.log('[DEBUG] Redis host:', process.env.REDIS_HOST, 'port:', process.env.REDIS_PORT)

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379'),
  lazyConnect: true
})

redis.on('error', (err) => {
  console.warn('[DEBUG] Redis error:', err.message)
})

redis.on('connect', () => {
  console.log('[DEBUG] Redis connected')
})

redis.on('ready', () => {
  console.log('[DEBUG] Redis ready')
})

if (process.env.REDIS_HOST) {
  console.log('[DEBUG] Attempting to connect to Redis...')
  await redis.connect().catch(err => {
    console.warn('[DEBUG] Redis connection failed (continuing anyway):', err.message)
  })
} else {
  console.warn('[DEBUG] REDIS_HOST not set, Redis disabled')
}

console.log('[DEBUG] Initializing Elysia server...')

const app = new Elysia()
  .use(swagger())

app.get('/todos', async () => {
  console.log('[DEBUG] GET /todos - Querying database...')
  const { rows } = await pool.query('SELECT * FROM todos ORDER BY created_at DESC')
  console.log('[DEBUG] GET /todos - Query successful, returned', rows.length, 'rows')
  return rows
})

app.post('/todos', async ({ body }) => {
  console.log('[DEBUG] POST /todos - Inserting todo:', body.title)
  const { rows } = await pool.query(
    'INSERT INTO todos (title, completed) VALUES ($1, $2) RETURNING *',
    [body.title, body.completed ?? false]
  )
  console.log('[DEBUG] POST /todos - Insert successful, ID:', rows[0].id)
  return rows[0]
}, {
  body: t.Object({
    title: t.String(),
    completed: t.Optional(t.Boolean())
  })
})

app.put('/todos/:id', async ({ params, body }) => {
  const { rows } = await pool.query(
    'UPDATE todos SET title = $1, completed = $2 WHERE id = $3 RETURNING *',
    [body.title, body.completed, params.id]
  )
  return rows[0]
}, {
  body: t.Object({
    title: t.String(),
    completed: t.Boolean()
  })
})

app.delete('/todos/:id', async ({ params }) => {
  await pool.query('DELETE FROM todos WHERE id = $1', [params.id])
  return { success: true }
})

app.get('/redis/test', async () => {
  if (redis.status !== 'ready') {
    return { status: 'disconnected' }
  }
  const result = await redis.ping()
  return { status: 'connected', ping: result }
})

app.get('/redis/:key', async ({ params }) => {
  if (redis.status !== 'ready') {
    throw new Error('Redis not connected')
  }
  const value = await redis.get(params.key)
  return { key: params.key, value }
})

app.post('/redis', async ({ body }) => {
  if (redis.status !== 'ready') {
    throw new Error('Redis not connected')
  }
  await redis.set(body.key, body.value)
  if (body.ttl) {
    await redis.expire(body.key, body.ttl)
  }
  return { success: true }
}, {
  body: t.Object({
    key: t.String(),
    value: t.String(),
    ttl: t.Optional(t.Number())
  })
})

app.delete('/redis/:key', async ({ params }) => {
  if (redis.status !== 'ready') {
    throw new Error('Redis not connected')
  }
  await redis.del(params.key)
  return { success: true }
})

app.get('/health', async () => {
  console.log('[DEBUG] GET /health - Checking database connection...')
  try {
    const result = await pool.query('SELECT NOW()')
    console.log('[DEBUG] GET /health - Database OK, time:', result.rows[0].now)
    return {
      status: 'ok',
      database: 'connected',
      postgres_time: result.rows[0].now,
      redis: redis.status === 'ready' ? 'connected' : 'disconnected'
    }
  } catch (err) {
    console.error('[DEBUG] GET /health - Database failed:', err.message)
    return {
      status: 'error',
      database: 'disconnected',
      error: err.message
    }
  }
})

app.listen(3000, () => {
  console.log('🦊 Elysia is running at http://localhost:3000')
})
