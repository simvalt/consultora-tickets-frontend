import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { Api, errorMessage } from '../../core/api';
import { CanDirective } from '../../core/can.directive';
import { STATUS_LABELS, TicketComment, TicketDetail, TicketEvent } from '../../core/models';
import { Notify } from '../../core/notify.service';
import { PriorityBadge, StatusBadge } from '../../shared/badges';
import { confirm } from '../../shared/confirm-dialog';
import { ErrorState, LoadingBar } from '../../shared/states';
import { AssignDialog, StatusDialog } from './ticket-dialogs';

@Component({
  selector: 'app-ticket-detail',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    DatePipe,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    CanDirective,
    StatusBadge,
    PriorityBadge,
    ErrorState,
    LoadingBar,
  ],
  template: `
    <app-loading-bar [active]="loading()" />
    @if (loadError()) {
      <app-error-state [message]="loadError()!"
        ><a mat-stroked-button routerLink="/tickets">Volver al listado</a></app-error-state
      >
    } @else if (ticket(); as t) {
      <div class="page-header">
        <a mat-icon-button routerLink="/tickets" aria-label="Volver al listado"><mat-icon>arrow_back</mat-icon></a>
        <h1>
          <span class="folio" data-testid="folio">{{ t.folio }}</span> {{ t.title }}
        </h1>
        <div class="actions">
          @if (t.allowed_transitions.length) {
            <button
              *appCan="['tickets', 3]"
              mat-flat-button
              [disabled]="loading()"
              (click)="changeStatus()"
              data-testid="change-status"
            >
              <mat-icon>swap_horiz</mat-icon> Cambiar estatus
            </button>
          }
          @if (canAssign(t)) {
            <button
              *appCan="['tickets', 3]"
              mat-stroked-button
              [disabled]="loading()"
              (click)="assign()"
              data-testid="assign"
            >
              <mat-icon>person_add</mat-icon> {{ t.assignee_id ? 'Reasignar' : 'Asignar' }}
            </button>
          }
          <a
            *appCan="['tickets', 3]"
            mat-stroked-button
            [disabled]="loading()"
            [routerLink]="['/tickets', t.id, 'edit']"
            data-testid="edit"
          >
            <mat-icon>edit</mat-icon> Editar
          </a>
          <button
            *appCan="['tickets', 4]"
            mat-stroked-button
            class="danger-outline"
            [disabled]="loading()"
            (click)="remove()"
            data-testid="delete"
          >
            <mat-icon>delete</mat-icon> Eliminar
          </button>
        </div>
      </div>

      <div class="layout">
        <section class="card main">
          <div class="chips">
            <app-status-badge [status]="t.status" data-testid="status" />
            <app-priority-badge [priority]="t.priority" />
            @if (t.is_overdue) {
              <span class="badge prio-critica">Vencido</span>
            }
          </div>
          <h2>Descripción</h2>
          <p class="pre">{{ t.description || 'Sin descripción' }}</p>
          @if (t.resolution) {
            <h2>Resolución</h2>
            <p class="pre" data-testid="resolution">{{ t.resolution }}</p>
          }

          <h2>Comentarios internos ({{ comments().length }})</h2>
          @for (c of comments(); track c.id) {
            <article class="comment">
              <header>
                <strong>{{ c.author_name }}</strong>
                <small class="muted">{{ c.created_at | date: 'dd/MM/yyyy HH:mm' }}</small>
              </header>
              <p class="pre">{{ c.body }}</p>
            </article>
          } @empty {
            <p class="muted">Aún no hay comentarios.</p>
          }
          <form *appCan="['tickets', 3]" [formGroup]="commentForm" (ngSubmit)="addComment()" class="comment-form">
            <mat-form-field appearance="outline" class="full">
              <mat-label>Agregar comentario</mat-label>
              <textarea matInput rows="3" formControlName="body" maxlength="5000" data-testid="comment-body"></textarea>
            </mat-form-field>
            <button
              mat-flat-button
              type="submit"
              [disabled]="commentForm.invalid || commenting()"
              data-testid="comment-send"
            >
              Comentar
            </button>
          </form>
        </section>

        <aside class="side">
          <section class="card">
            <h2>Detalles</h2>
            <dl>
              <dt>Cliente</dt>
              <dd>{{ t.client_name }}</dd>
              <dt>Categoría</dt>
              <dd>{{ t.category_name }}</dd>
              <dt>Responsable</dt>
              <dd data-testid="assignee">{{ t.assignee_name || 'Sin responsable' }}</dd>
              <dt>Creado por</dt>
              <dd>{{ t.created_by_name }}</dd>
              <dt>Creado</dt>
              <dd>{{ t.created_at | date: 'dd/MM/yyyy HH:mm' }}</dd>
              <dt>Última modificación</dt>
              <dd>{{ t.updated_at | date: 'dd/MM/yyyy HH:mm' }}</dd>
              <dt>Inicio de atención</dt>
              <dd>{{ t.started_at ? (t.started_at | date: 'dd/MM/yyyy HH:mm') : '—' }}</dd>
              <dt>Cierre</dt>
              <dd>{{ t.closed_at ? (t.closed_at | date: 'dd/MM/yyyy HH:mm') : '—' }}</dd>
              <dt>Vencimiento</dt>
              <dd [class.overdue]="t.is_overdue">{{ t.due_at ? (t.due_at | date: 'dd/MM/yyyy HH:mm') : '—' }}</dd>
            </dl>
          </section>
          <section class="card">
            <h2>Historial</h2>
            <ol class="timeline" data-testid="history">
              @for (e of events(); track e.id) {
                <li>
                  <span class="dot" aria-hidden="true"></span>
                  <div>
                    <strong>{{ describe(e) }}</strong>
                    <div class="muted">{{ e.actor_name }} · {{ e.created_at | date: 'dd/MM/yyyy HH:mm' }}</div>
                    @if (e.reason) {
                      <div class="reason">{{ e.reason }}</div>
                    }
                  </div>
                </li>
              }
            </ol>
          </section>
        </aside>
      </div>
    }
  `,
  styles: `
    .folio {
      color: var(--muted);
      font-weight: 500;
      margin-right: 8px;
    }
    .layout {
      display: grid;
      grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr);
      gap: 16px;
      align-items: start;
    }
    .side {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .chips {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 8px;
    }
    .pre {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      margin: 0 0 16px;
    }
    dl {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 6px 12px;
      margin: 0;
    }
    dt {
      color: var(--muted);
    }
    dd {
      margin: 0;
      text-align: right;
    }
    .comment {
      border-top: 1px solid var(--border);
      padding: 10px 0 0;
    }
    .comment header {
      display: flex;
      justify-content: space-between;
      gap: 8px;
    }
    .comment-form {
      margin-top: 16px;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
    }
    .timeline {
      list-style: none;
      margin: 0;
      padding: 0 0 0 4px;
    }
    .timeline li {
      display: flex;
      gap: 12px;
      padding-bottom: 14px;
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--mat-sys-primary);
      margin-top: 6px;
      flex: none;
    }
    .reason {
      background: var(--surface-alt);
      border-radius: 6px;
      padding: 6px 8px;
      margin-top: 4px;
      white-space: pre-wrap;
    }
    .danger-outline {
      color: var(--danger);
    }
    @media (max-width: 899px) {
      .layout {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class TicketDetailPage implements OnInit {
  readonly id = input.required<string>();

  private readonly api = inject(Api);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(Notify);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly ticket = signal<TicketDetail | null>(null);
  readonly comments = signal<TicketComment[]>([]);
  readonly events = signal<TicketEvent[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly commenting = signal(false);
  readonly commentForm = this.fb.nonNullable.group({ body: ['', [Validators.required, Validators.pattern(/\S/)]] });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    const id = this.id();
    this.loading.set(true);
    forkJoin({
      ticket: this.api.get<TicketDetail>(`/tickets/${id}`),
      comments: this.api.get<TicketComment[]>(`/tickets/${id}/comments`),
      events: this.api.get<TicketEvent[]>(`/tickets/${id}/events`),
    }).subscribe({
      next: (r) => {
        this.ticket.set(r.ticket);
        this.comments.set(r.comments);
        this.events.set(r.events);
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.loadError.set(errorMessage(e, 'No se pudo cargar el ticket.'));
      },
    });
  }

  canAssign(t: TicketDetail): boolean {
    return !['cerrado', 'cancelado', 'rechazado'].includes(t.status);
  }

  describe(e: TicketEvent): string {
    const s = (x: string | null) => (x ? STATUS_LABELS[x as keyof typeof STATUS_LABELS] : '');
    switch (e.event_type) {
      case 'created':
        return 'Ticket creado';
      case 'status_change':
        return `Estatus: ${s(e.from_status)} → ${s(e.to_status)}`;
      case 'reopen':
        return `Reapertura: ${s(e.from_status)} → ${s(e.to_status)}`;
      case 'assignment':
        return e.to_assignee_name
          ? e.from_assignee_name
            ? `Reasignado de ${e.from_assignee_name} a ${e.to_assignee_name}`
            : `Asignado a ${e.to_assignee_name}`
          : 'Responsable retirado';
      default:
        return 'Ticket eliminado';
    }
  }

  changeStatus(): void {
    if (this.loading()) return;
    this.dialog
      .open(StatusDialog, { data: { ticket: this.ticket() }, width: '480px', maxWidth: '95vw' })
      .afterClosed()
      .subscribe((t) => {
        if (t) {
          this.ticket.set(t);
          this.notify.success('Estatus actualizado');
          this.load();
        }
      });
  }

  assign(): void {
    if (this.loading()) return;
    this.dialog
      .open(AssignDialog, { data: { ticket: this.ticket() }, width: '440px', maxWidth: '95vw' })
      .afterClosed()
      .subscribe((t) => {
        if (t) {
          this.ticket.set(t);
          this.notify.success('Responsable actualizado');
          this.load();
        }
      });
  }

  addComment(): void {
    if (this.commentForm.invalid) return;
    this.commenting.set(true);
    this.api
      .post<TicketComment>(`/tickets/${this.id()}/comments`, { body: this.commentForm.getRawValue().body.trim() })
      .subscribe({
        next: (c) => {
          this.comments.update((l) => [...l, c]);
          this.commentForm.reset();
          this.commenting.set(false);
          this.notify.success('Comentario agregado');
        },
        error: (e) => {
          this.commenting.set(false);
          this.notify.error(errorMessage(e));
        },
      });
  }

  remove(): void {
    const t = this.ticket();
    if (!t) return;
    confirm(this.dialog, {
      title: 'Eliminar ticket',
      message: `El ticket ${t.folio} dejará de mostrarse. Su historial se conserva en la base de datos.`,
      confirmLabel: 'Eliminar',
      danger: true,
    }).subscribe((ok) => {
      if (!ok) return;
      this.api.delete<void>(`/tickets/${t.id}`).subscribe({
        next: () => {
          this.notify.success('Ticket eliminado');
          void this.router.navigate(['/tickets']);
        },
        error: (e) => this.notify.error(errorMessage(e)),
      });
    });
  }
}
