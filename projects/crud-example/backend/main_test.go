package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func doRequest(t *testing.T, h http.Handler, method, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			t.Fatalf("encode body: %v", err)
		}
	}
	req := httptest.NewRequest(method, path, &buf)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func decodeTodo(t *testing.T, rec *httptest.ResponseRecorder) Todo {
	t.Helper()
	var todo Todo
	if err := json.NewDecoder(rec.Body).Decode(&todo); err != nil {
		t.Fatalf("decode todo: %v", err)
	}
	return todo
}

func TestCRUDCycle(t *testing.T) {
	h := newServer(NewStore())

	// Empty list.
	rec := doRequest(t, h, http.MethodGet, "/api/todos", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("list: got %d, want 200", rec.Code)
	}
	var todos []Todo
	if err := json.NewDecoder(rec.Body).Decode(&todos); err != nil {
		t.Fatalf("decode list: %v", err)
	}
	if len(todos) != 0 {
		t.Fatalf("list: got %d todos, want 0", len(todos))
	}

	// Create.
	rec = doRequest(t, h, http.MethodPost, "/api/todos", todoInput{Title: "buy milk"})
	if rec.Code != http.StatusCreated {
		t.Fatalf("create: got %d, want 201", rec.Code)
	}
	created := decodeTodo(t, rec)
	if created.ID == 0 || created.Title != "buy milk" || created.Completed {
		t.Fatalf("create: unexpected todo %+v", created)
	}

	// Get.
	rec = doRequest(t, h, http.MethodGet, "/api/todos/1", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("get: got %d, want 200", rec.Code)
	}

	// Update.
	rec = doRequest(t, h, http.MethodPut, "/api/todos/1", todoInput{Title: "buy oat milk", Completed: true})
	if rec.Code != http.StatusOK {
		t.Fatalf("update: got %d, want 200", rec.Code)
	}
	updated := decodeTodo(t, rec)
	if updated.Title != "buy oat milk" || !updated.Completed {
		t.Fatalf("update: unexpected todo %+v", updated)
	}

	// Delete.
	rec = doRequest(t, h, http.MethodDelete, "/api/todos/1", nil)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("delete: got %d, want 204", rec.Code)
	}
	rec = doRequest(t, h, http.MethodGet, "/api/todos/1", nil)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("get after delete: got %d, want 404", rec.Code)
	}
}

func TestValidation(t *testing.T) {
	h := newServer(NewStore())

	tests := []struct {
		name   string
		method string
		path   string
		body   any
		want   int
	}{
		{"create empty title", http.MethodPost, "/api/todos", todoInput{Title: "   "}, http.StatusBadRequest},
		{"create invalid json", http.MethodPost, "/api/todos", nil, http.StatusBadRequest},
		{"get missing", http.MethodGet, "/api/todos/99", nil, http.StatusNotFound},
		{"update missing", http.MethodPut, "/api/todos/99", todoInput{Title: "x"}, http.StatusNotFound},
		{"delete missing", http.MethodDelete, "/api/todos/99", nil, http.StatusNotFound},
		{"non-numeric id", http.MethodGet, "/api/todos/abc", nil, http.StatusBadRequest},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := doRequest(t, h, tt.method, tt.path, tt.body)
			if rec.Code != tt.want {
				t.Fatalf("got %d, want %d", rec.Code, tt.want)
			}
		})
	}
}

func TestCORSPreflight(t *testing.T) {
	h := newServer(NewStore())
	rec := doRequest(t, h, http.MethodOptions, "/api/todos", nil)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("preflight: got %d, want 204", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Fatalf("preflight: Allow-Origin = %q, want *", got)
	}
}
