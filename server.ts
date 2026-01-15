import { Elysia, t } from 'elysia'
import { swagger } from '@elysiajs/swagger'
import pg from 'pg'
import Redis from 'ioredis'

const { Pool } = pg

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
})

await pool.query(`
  CREATE TABLE IF NOT EXISTS todos (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`)


const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379')
})

const app = new Elysia()
  .use(swagger())

app.get('/todos', async () => {
  const { rows } = await pool.query('SELECT * FROM todos ORDER BY created_at DESC')
  return rows
})

app.post('/todos', async ({ body }) => {
  const { rows } = await pool.query(
    'INSERT INTO todos (title, completed) VALUES ($1, $2) RETURNING *',
    [body.title, body.completed ?? false]
  )
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
  console.log(redis.status)
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

app.listen(3000, () => {
  console.log('🦊 Elysia is running at http://localhost:3000')
})
