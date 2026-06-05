'use client';

import { useEffect, useState } from 'react';
import { ChevronDownIcon, PlusIcon, CheckIcon, Trash2Icon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TodoRow } from '@/lib/db/dexie';
import { todoRepo } from '@/lib/db/repositories/todo.repo';

interface Props {
  trailId: string;
  userId: string;
  todos: TodoRow[];
  /** Optional: pin newly-added reminders to a specific day. */
  stageId?: string | null;
}

export function TodoList({ trailId, userId, todos, stageId }: Props) {
  const storageKey = `todo:collapsed:${trailId}`;
  const [collapsed, setCollapsed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');

  // Restore the per-trail collapsed state on mount.
  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      setCollapsed(localStorage.getItem(storageKey) === '1');
    }
  }, [storageKey]);

  const remaining = todos.filter((t) => !t.done).length;

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(storageKey, next ? '1' : '0');
      }
      return next;
    });
  }

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = text.trim();
    if (!value) {
      setAdding(false);
      return;
    }
    setText('');
    await todoRepo.add({ trail_id: trailId, user_id: userId, text: value, stage_id: stageId ?? null });
  }

  return (
    <section className="rounded-2xl border bg-card p-4">
      <button
        onClick={toggleCollapsed}
        className="flex w-full items-center justify-between"
        aria-expanded={!collapsed}
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          To-do · {remaining} left
        </h2>
        <ChevronDownIcon
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform',
            collapsed && '-rotate-90',
          )}
        />
      </button>

      {!collapsed && (
        <div className="mt-2">
          {todos.length > 0 && (
            <ul className="divide-y divide-border">
              {todos.map((todo) => (
                <li key={todo.id} className="flex min-h-[44px] items-center gap-3 py-1.5">
                  <button
                    onClick={() => todoRepo.toggle(todo.id)}
                    aria-label={todo.done ? 'Mark as not done' : 'Mark as done'}
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors',
                      todo.done
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border hover:border-primary',
                    )}
                  >
                    {todo.done && <CheckIcon className="h-4 w-4" />}
                  </button>
                  <span
                    className={cn(
                      'flex-1 text-sm',
                      todo.done && 'text-muted-foreground line-through opacity-60',
                    )}
                  >
                    {todo.text}
                  </span>
                  <button
                    onClick={() => todoRepo.remove(todo.id)}
                    aria-label="Delete reminder"
                    className="shrink-0 p-1 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2Icon className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {adding ? (
            <form onSubmit={handleAdd} className="mt-2">
              <input
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                onBlur={() => {
                  if (!text.trim()) setAdding(false);
                }}
                placeholder="Add a reminder…"
                className="input"
              />
            </form>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="mt-2 flex min-h-[44px] items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <PlusIcon className="h-4 w-4" />
              add a reminder
            </button>
          )}
        </div>
      )}
    </section>
  );
}
