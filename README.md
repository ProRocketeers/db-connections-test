# Simple TODO API with Bun, Elysia, PostgreSQL, and Redis

## Setup.

1. Install dependencies:
```bash
bun install
```

2. Copy environment file:
```bash
cp .env.example .env
```

3. Edit `.env` with your PostgreSQL and Redis credentials

4. Run the server:
```bash
bun run start
```

## API Endpoints

### PostgreSQL
- `GET /swagger` - Interactive API documentation
- `GET /todos` - List all todos
- `POST /todos` - Create todo: `{"title": "Buy milk", "completed": false}`
- `PUT /todos/:id` - Update todo: `{"title": "Buy milk", "completed": true}`
- `DELETE /todos/:id` - Delete todo

### Redis
- `GET /redis/test` - Test Redis connection
- `GET /redis/:key` - Get value by key
- `POST /redis` - Set key-value: `{"key":"mykey","value":"myvalue","ttl":60}` (ttl optional)
- `DELETE /redis/:key` - Delete key

## Test

```bash
curl http://localhost:3000/todos
curl -X POST http://localhost:3000/todos -H "Content-Type: application/json" -d '{"title":"Test todo"}'
```

## Docker

Build and run:
```bash
docker build -t todo-api .
docker run -p 3000:3000 --env-file .env todo-api
```
