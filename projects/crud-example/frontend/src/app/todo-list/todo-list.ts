import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { Todo } from '../todo.model';
import { TodoService } from '../todo.service';

@Component({
  selector: 'app-todo-list',
  imports: [FormsModule],
  templateUrl: './todo-list.html',
  styleUrl: './todo-list.css',
})
export class TodoList {
  private readonly todoService = inject(TodoService);

  protected readonly todos = signal<Todo[]>([]);
  protected readonly remaining = computed(
    () => this.todos().filter((t) => !t.completed).length,
  );
  protected readonly error = signal('');

  protected newTitle = '';
  protected editingId = signal<number | null>(null);
  protected editTitle = '';

  constructor() {
    this.todoService.list().subscribe({
      next: (todos) => this.todos.set(todos),
      error: () => this.error.set('Could not load todos. Is the backend running?'),
    });
  }

  protected add(): void {
    const title = this.newTitle.trim();
    if (!title) {
      return;
    }
    this.todoService.create(title).subscribe({
      next: (todo) => {
        this.todos.update((todos) => [...todos, todo]);
        this.newTitle = '';
        this.error.set('');
      },
      error: () => this.error.set('Could not add todo.'),
    });
  }

  protected toggle(todo: Todo): void {
    this.todoService.update({ ...todo, completed: !todo.completed }).subscribe({
      next: (updated) => this.replace(updated),
      error: () => this.error.set('Could not update todo.'),
    });
  }

  protected startEdit(todo: Todo): void {
    this.editingId.set(todo.id);
    this.editTitle = todo.title;
  }

  protected saveEdit(todo: Todo): void {
    const title = this.editTitle.trim();
    if (!title) {
      this.cancelEdit();
      return;
    }
    this.todoService.update({ ...todo, title }).subscribe({
      next: (updated) => {
        this.replace(updated);
        this.cancelEdit();
      },
      error: () => this.error.set('Could not update todo.'),
    });
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.editTitle = '';
  }

  protected remove(todo: Todo): void {
    this.todoService.delete(todo.id).subscribe({
      next: () =>
        this.todos.update((todos) => todos.filter((t) => t.id !== todo.id)),
      error: () => this.error.set('Could not delete todo.'),
    });
  }

  private replace(updated: Todo): void {
    this.todos.update((todos) =>
      todos.map((t) => (t.id === updated.id ? updated : t)),
    );
  }
}
