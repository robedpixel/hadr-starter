# crud-example — Todo list app

A minimal CRUD example: **Angular** frontend, **Go** backend (stdlib only, in-memory store).

> Data lives in memory only — restarting the backend clears all todos.

## Run it (two terminals)

```bash
# Terminal 1 — API on http://localhost:8080
cd backend
go run .

# Terminal 2 — app on http://localhost:4200 (proxies /api to :8080)
cd frontend
npm install
npm start
```

Open http://localhost:4200 — add, toggle, edit, and delete todos.

## API

| Method | Path              | Description                  | Status codes    |
| ------ | ----------------- | ---------------------------- | --------------- |
| GET    | `/api/todos`      | List all todos               | 200             |
| POST   | `/api/todos`      | Create (`{"title": "..."}`)  | 201, 400        |
| GET    | `/api/todos/{id}` | Fetch one todo               | 200, 404        |
| PUT    | `/api/todos/{id}` | Update title/completed       | 200, 400, 404   |
| DELETE | `/api/todos/{id}` | Delete                       | 204, 404        |

Todo shape: `{"id": 1, "title": "buy milk", "completed": false}`

## Tests

```bash
cd backend
go test ./...
```

## Layout

- `backend/` — Go module. `main.go` (routing + CORS), `store.go` (in-memory store), `main_test.go`.
- `frontend/` — Angular app. Todo feature lives in `src/app/` (`todo.model.ts`, `todo.service.ts`, `todo-list/`); dev-server proxy in `proxy.conf.json`.
