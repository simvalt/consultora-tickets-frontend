import { Component, computed, input } from '@angular/core';
import { PRIORITY_LABELS, STATUS_LABELS, TicketPriority, TicketStatus } from '../core/models';

@Component({
  selector: 'app-status-badge',
  template: `<span class="badge" [class]="'status-' + status()">{{ label() }}</span>`,
})
export class StatusBadge {
  readonly status = input.required<TicketStatus>();
  readonly label = computed(() => STATUS_LABELS[this.status()]);
}

@Component({
  selector: 'app-priority-badge',
  template: `<span class="badge" [class]="'prio-' + priority()">{{ label() }}</span>`,
})
export class PriorityBadge {
  readonly priority = input.required<TicketPriority>();
  readonly label = computed(() => PRIORITY_LABELS[this.priority()]);
}
