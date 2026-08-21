/**
 * TaskPanel — Task list with status badges, create form, checklist toggles, optimistic updates.
 */

import { useCallback, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Circle, Loader2, Plus, Square, SquareCheck } from 'lucide-react';

import { createTask, listTasks, updateTask } from '../services/incident-workbench.service';
import type {
  CreateTaskBody,
  IncidentTask,
  TaskChecklist,
  TaskListResponse,
  TaskStatus,
} from '../types/incident-workbench.types';

export interface TaskPanelProps {
  incidentId: string;
}

const STATUS_ICONS: Record<TaskStatus, JSX.Element> = {
  open: <Circle size={14} aria-hidden="true" />,
  in_progress: <Loader2 size={14} aria-hidden="true" />,
  completed: <CheckCircle2 size={14} aria-hidden="true" />,
  blocked: <Square size={14} aria-hidden="true" />,
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  completed: 'Completed',
  blocked: 'Blocked',
};

export function TaskPanel({ incidentId }: TaskPanelProps): JSX.Element {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<TaskStatus | undefined>(undefined);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskAssignee, setNewTaskAssignee] = useState('');

  const queryKey = ['incident-tasks', incidentId, undefined, statusFilter] as const;

  const tasksQuery = useQuery({
    queryKey,
    queryFn: () => listTasks(incidentId, { status: statusFilter }),
    staleTime: 15_000,
  });

  const createMutation = useMutation({
    mutationFn: (body: CreateTaskBody) => createTask(incidentId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['incident-tasks', incidentId] });
      setShowCreateForm(false);
      setNewTaskTitle('');
      setNewTaskAssignee('');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (vars: { taskId: string; checklist: Array<{ id: string; checked: boolean }>; version: number }) =>
      updateTask(incidentId, vars.taskId, { checklist: vars.checklist }, String(vars.version)),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<TaskListResponse>(queryKey);
      // Optimistic update
      if (previous) {
        const updated: TaskListResponse = {
          ...previous,
          items: previous.items.map((task) => {
            if (task.id !== vars.taskId) return task;
            return {
              ...task,
              checklist: task.checklist.map((item) => {
                const change = vars.checklist.find((c) => c.id === item.id);
                return change ? { ...item, checked: change.checked } : item;
              }),
            };
          }),
        };
        queryClient.setQueryData<TaskListResponse>(queryKey, updated);
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      // Rollback
      if (context?.previous) {
        queryClient.setQueryData<TaskListResponse>(queryKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['incident-tasks', incidentId] });
    },
  });

  const toggleChecklist = useCallback(
    (task: IncidentTask, item: TaskChecklist) => {
      updateMutation.mutate({
        taskId: task.id,
        checklist: [{ id: item.id, checked: !item.checked }],
        version: task.version,
      });
    },
    [updateMutation]
  );

  const handleCreateTask = useCallback(() => {
    if (!newTaskTitle.trim()) return;
    const body: CreateTaskBody = {
      title: newTaskTitle.trim(),
      ...(newTaskAssignee.trim() ? { assignee: newTaskAssignee.trim() } : {}),
    };
    createMutation.mutate(body);
  }, [newTaskTitle, newTaskAssignee, createMutation]);

  const tasks = tasksQuery.data?.items ?? [];

  return (
    <section className="task-panel" aria-label="Incident tasks">
      <div className="task-panel__header">
        <h2 className="task-panel__title">Tasks</h2>
        <div className="task-panel__filters" role="group" aria-label="Filter tasks by status">
          <button
            className="task-panel__filter"
            type="button"
            data-active={String(statusFilter === undefined)}
            onClick={() => setStatusFilter(undefined)}
          >
            All
          </button>
          {(Object.keys(STATUS_LABELS) as TaskStatus[]).map((status) => (
            <button
              className="task-panel__filter"
              type="button"
              key={status}
              data-active={String(statusFilter === status)}
              onClick={() => setStatusFilter(status)}
            >
              {STATUS_LABELS[status]}
            </button>
          ))}
        </div>
        <button
          className="task-panel__add-btn"
          type="button"
          onClick={() => setShowCreateForm(!showCreateForm)}
          aria-expanded={showCreateForm}
          aria-label="Create new task"
        >
          <Plus size={14} aria-hidden="true" />
        </button>
      </div>

      {showCreateForm && (
        <form
          className="task-panel__create-form"
          onSubmit={(e) => {
            e.preventDefault();
            handleCreateTask();
          }}
          aria-label="Create task form"
        >
          <input
            className="task-panel__input"
            type="text"
            placeholder="Task title…"
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            required
            aria-label="Task title"
          />
          <input
            className="task-panel__input task-panel__input--small"
            type="text"
            placeholder="Assignee (optional)"
            value={newTaskAssignee}
            onChange={(e) => setNewTaskAssignee(e.target.value)}
            aria-label="Task assignee"
          />
          <button
            className="task-panel__submit-btn"
            type="submit"
            disabled={createMutation.isPending || !newTaskTitle.trim()}
          >
            {createMutation.isPending ? 'Creating…' : 'Create'}
          </button>
        </form>
      )}

      {tasksQuery.isLoading && (
        <div className="task-panel__loading" aria-busy="true">Loading tasks…</div>
      )}

      {tasksQuery.isError && (
        <div className="task-panel__error" role="alert">
          Could not load tasks. <button type="button" onClick={() => void tasksQuery.refetch()}>Retry</button>
        </div>
      )}

      {!tasksQuery.isLoading && !tasksQuery.isError && tasks.length === 0 && (
        <div className="task-panel__empty">No tasks yet. Create one to track investigation steps.</div>
      )}

      <ul className="task-panel__list" aria-label="Task list">
        {tasks.map((task) => (
          <li className="task-panel__item" key={task.id} data-status={task.status}>
            <div className="task-panel__item-header">
              <span className="task-panel__status-badge" data-status={task.status}>
                {STATUS_ICONS[task.status]}
                {STATUS_LABELS[task.status]}
              </span>
              <span className="task-panel__priority" data-priority={task.priority}>
                {task.priority}
              </span>
            </div>
            <strong className="task-panel__item-title">{task.title}</strong>
            {task.assignee && (
              <span className="task-panel__item-assignee">{task.assignee}</span>
            )}
            {task.checklist.length > 0 && (
              <ul className="task-panel__checklist" aria-label={`Checklist for ${task.title}`}>
                {task.checklist.map((item) => (
                  <li className="task-panel__checklist-item" key={item.id}>
                    <button
                      className="task-panel__check-btn"
                      type="button"
                      onClick={() => toggleChecklist(task, item)}
                      aria-pressed={item.checked}
                      aria-label={`${item.checked ? 'Uncheck' : 'Check'} ${item.label}`}
                    >
                      {item.checked ? (
                        <SquareCheck size={14} aria-hidden="true" />
                      ) : (
                        <Square size={14} aria-hidden="true" />
                      )}
                      <span data-checked={String(item.checked)}>{item.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
