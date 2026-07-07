import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Todo } from './todo.model';

@Injectable({ providedIn: 'root' })
export class TodoService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/todos';

  list(): Observable<Todo[]> {
    return this.http.get<Todo[]>(this.baseUrl);
  }

  create(title: string): Observable<Todo> {
    return this.http.post<Todo>(this.baseUrl, { title });
  }

  update(todo: Todo): Observable<Todo> {
    return this.http.put<Todo>(`${this.baseUrl}/${todo.id}`, {
      title: todo.title,
      completed: todo.completed,
    });
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
