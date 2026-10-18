import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  ChartConfiguration,
  DoughnutController,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import { ThemeService } from '../../core/theme.service';

Chart.register(
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  DoughnutController,
  ArcElement,
  Filler,
  Legend,
  Tooltip,
);

export interface ChartSeries {
  label: string;
  data: number[];
  /** Variable CSS del color (p. ej. '--accent'); se resuelve según el tema activo. */
  color?: string;
}

/**
 * Resuelve una variable CSS (que puede usar light-dark()) a un color concreto para el canvas,
 * que no entiende variables ni el esquema de color.
 */
function resolveColor(cssVar: string, alpha = 1): string {
  const probe = document.createElement('span');
  probe.style.color = `var(${cssVar})`;
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const rgb = getComputedStyle(probe).color;
  probe.remove();
  if (alpha >= 1) return rgb;
  const m = /rgba?\(([^)]+)\)/.exec(rgb);
  if (!m) return rgb;
  const [r, g, b] = m[1].split(/[\s,/]+/).filter(Boolean);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Envoltorio de Chart.js con colores del sistema visual, en claro y oscuro. */
@Component({
  selector: 'app-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chart-box" [style.height.px]="height()">
      <canvas #canvas role="img" [attr.aria-label]="ariaLabel()"></canvas>
    </div>
  `,
  styles: `
    .chart-box {
      position: relative;
      width: 100%;
    }
  `,
})
export class ChartComponent implements OnDestroy {
  readonly type = input<'bar' | 'line' | 'doughnut'>('bar');
  readonly labels = input.required<string[]>();
  readonly series = input.required<ChartSeries[]>();
  /** Un color (variable CSS) por punto: estatus en el donut, prioridades en las barras. */
  readonly pointColors = input<string[] | null>(null);
  readonly height = input(260);
  readonly ariaLabel = input('Gráfica');
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly theme = inject(ThemeService);
  private chart?: Chart;

  constructor() {
    effect(() => {
      const type = this.type();
      const labels = this.labels();
      const series = this.series();
      const pointColors = this.pointColors();
      this.theme.isDark(); // re-renderizar al cambiar de tema
      this.chart?.destroy();

      const text = resolveColor('--muted');
      const grid = resolveColor('--border');
      const surface = resolveColor('--surface');
      const font = { family: getComputedStyle(document.body).fontFamily, size: 12 };
      const isDoughnut = type === 'doughnut';
      const isLine = type === 'line';

      const config: ChartConfiguration = {
        type,
        data: {
          labels,
          datasets: series.map((s, i) => {
            const base = s.color ?? (i === 0 ? '--accent' : '--success');
            const color = resolveColor(base);
            const perPoint = pointColors?.map((c) => resolveColor(c));
            return {
              label: s.label,
              data: s.data,
              backgroundColor: isLine ? resolveColor(base, 0.12) : (perPoint ?? color),
              borderColor: isDoughnut ? surface : color,
              borderWidth: isDoughnut ? 3 : isLine ? 2 : 0,
              fill: isLine && i === 0,
              tension: 0.35,
              pointRadius: 0,
              pointHoverRadius: isLine ? 4 : 0,
              borderRadius: type === 'bar' ? 8 : 0,
              maxBarThickness: 44,
            };
          }),
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 450 },
          interaction: { mode: isLine ? 'index' : 'nearest', intersect: !isLine },
          cutout: isDoughnut ? '68%' : undefined,
          plugins: {
            legend: {
              display: isDoughnut || series.length > 1,
              position: 'bottom',
              labels: { color: text, font, usePointStyle: true, pointStyle: 'circle', boxWidth: 8, padding: 14 },
            },
            tooltip: { padding: 10, cornerRadius: 10, titleFont: font, bodyFont: font, boxPadding: 4 },
          },
          scales: isDoughnut
            ? {}
            : {
                x: {
                  grid: { display: false },
                  border: { display: false },
                  ticks: { color: text, font, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
                },
                y: {
                  beginAtZero: true,
                  grid: { color: grid },
                  border: { display: false },
                  ticks: { color: text, font, precision: 0, maxTicksLimit: 5 },
                },
              },
        } as ChartConfiguration['options'],
      };
      this.chart = new Chart(this.canvas().nativeElement, config);
    });
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }
}
