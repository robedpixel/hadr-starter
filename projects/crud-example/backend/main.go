package main

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
)

type todoInput struct {
	Title     string `json:"title"`
	Completed bool   `json:"completed"`
}

func newServer(store *Store) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/todos", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, store.List())
	})

	mux.HandleFunc("POST /api/todos", func(w http.ResponseWriter, r *http.Request) {
		in, ok := decodeInput(w, r)
		if !ok {
			return
		}
		writeJSON(w, http.StatusCreated, store.Create(in.Title))
	})

	mux.HandleFunc("GET /api/todos/{id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathID(w, r)
		if !ok {
			return
		}
		t, found := store.Get(id)
		if !found {
			http.Error(w, "todo not found", http.StatusNotFound)
			return
		}
		writeJSON(w, http.StatusOK, t)
	})

	mux.HandleFunc("PUT /api/todos/{id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathID(w, r)
		if !ok {
			return
		}
		in, ok := decodeInput(w, r)
		if !ok {
			return
		}
		t, found := store.Update(id, in.Title, in.Completed)
		if !found {
			http.Error(w, "todo not found", http.StatusNotFound)
			return
		}
		writeJSON(w, http.StatusOK, t)
	})

	mux.HandleFunc("DELETE /api/todos/{id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathID(w, r)
		if !ok {
			return
		}
		if !store.Delete(id) {
			http.Error(w, "todo not found", http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})

	return cors(mux)
}

// cors allows any origin so the API is usable without the Angular dev proxy.
func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func decodeInput(w http.ResponseWriter, r *http.Request) (todoInput, bool) {
	var in todoInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, "invalid JSON body", http.StatusBadRequest)
		return in, false
	}
	in.Title = strings.TrimSpace(in.Title)
	if in.Title == "" {
		http.Error(w, "title must not be empty", http.StatusBadRequest)
		return in, false
	}
	return in, true
}

func pathID(w http.ResponseWriter, r *http.Request) (int, bool) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		http.Error(w, "invalid todo id", http.StatusBadRequest)
		return 0, false
	}
	return id, true
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("encode response: %v", err)
	}
}

func main() {
	addr := ":8080"
	log.Printf("todo API listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, newServer(NewStore())))
}
