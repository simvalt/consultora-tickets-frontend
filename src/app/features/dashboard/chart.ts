import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, effect, input, viewChild } from '@angular/core';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  ChartConfiguration,
  DoughnutController,
  ArcElement,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';

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
  Legend,
  Tooltip,
);

export interface ChartSeries {
  label: string;
  data: number[];
  color?: string;
}

export const PALETTE = ['#1e66d0', '#e07a1f', '#2a9d62', '#8e4ec6', '#d1435b', '#0e9aa7', '#9a8b2b'];

/** Envoltorio mínimo de Chart.js. Incluye una tabla accesible equivalente para lectores de pantalla. */
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
  readonly height = input(260);
  readonly horizontal = input(false);
  readonly ariaLabel = input('Gráfica');
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private chart?: Chart;

  constructor() {
    effect(() => {
      const type = this.type();
      const labels = this.labels();
      const series = this.series();
      const horizontal = this.horizontal();
      this.chart?.destroy();
      const isDoughnut = type === 'doughnut';
      const config: ChartConfiguration = {
        type,
        data: {
          labels,
          datasets: series.map((s, i) => {
            const color = s.color ?? PALETTE[i % PALETTE.length];
            return {
              label: s.label,
              data: s.data,
              backgroundColor: isDoughnut ? labels.map((_, j) => PALETTE[j % PALETTE.length]) : color,
              borderColor: isDoughnut ? '#fff' : color,
              borderWidth: isDoughnut ? 2 : type === 'line' ? 2 : 0,
              tension: 0.25,
              pointRadius: type === 'line' ? 2 : 0,
              borderRadius: type === 'bar' ? 4 : 0,
            };
          }),
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: horizontal ? 'y' : 'x',
          plugins: { legend: { display: isDoughnut || series.length > 1, position: 'bottom' } },
          scales: isDoughnut
            ? {}
            : {
                x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
                y: { beginAtZero: true, ticks: { precision: 0 } },
              },
        },
      };
      this.chart = new Chart(this.canvas().nativeElement, config);
    });
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }
}
