import { dashboardMetrics } from "@/lib/mock-data";
import { Card } from "@/components/ui/card";

export function MetricsGrid() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {dashboardMetrics.map((metric) => (
        <Card key={metric.label} className="bg-white/70">
          <p className="text-xs uppercase tracking-[0.22em] text-black/50">{metric.label}</p>
          <p className="mt-3 text-4xl font-semibold tracking-tight text-ink">{metric.value}</p>
          <p className="mt-2 text-sm text-black/60">{metric.change}</p>
        </Card>
      ))}
    </div>
  );
}
