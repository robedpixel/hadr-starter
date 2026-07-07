package main

import (
	"sort"
	"sync"
)

// Todo is a single todo item.
type Todo struct {
	ID        int    `json:"id"`
	Title     string `json:"title"`
	Completed bool   `json:"completed"`
}

// Store is an in-memory, concurrency-safe todo store.
// Data is lost when the process exits.
type Store struct {
	mu     sync.Mutex
	todos  map[int]Todo
	nextID int
}

func NewStore() *Store {
	return &Store{todos: make(map[int]Todo), nextID: 1}
}

// List returns all todos sorted by ID.
func (s *Store) List() []Todo {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]Todo, 0, len(s.todos))
	for _, t := range s.todos {
		out = append(out, t)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

func (s *Store) Create(title string) Todo {
	s.mu.Lock()
	defer s.mu.Unlock()
	t := Todo{ID: s.nextID, Title: title}
	s.nextID++
	s.todos[t.ID] = t
	return t
}

func (s *Store) Get(id int) (Todo, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	t, ok := s.todos[id]
	return t, ok
}

func (s *Store) Update(id int, title string, completed bool) (Todo, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	t, ok := s.todos[id]
	if !ok {
		return Todo{}, false
	}
	t.Title = title
	t.Completed = completed
	s.todos[id] = t
	return t, true
}

func (s *Store) Delete(id int) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.todos[id]; !ok {
		return false
	}
	delete(s.todos, id)
	return true
}
