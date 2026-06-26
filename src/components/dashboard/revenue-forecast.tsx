'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/currency';
import { TrendingUp, Loader2 } from 'lucide-react';

interface StageForecast {
  stageId: string;
  stageName: string;
  stageColor: string;
  probability: number;
  dealsCount: number;
  totalValue: number;
  weightedValue: number;
}

interface Props {
  currency: string;
}

export function RevenueForecast({ currency }: Props) {
  const [stages, setStages] = useState<StageForecast[]>([]);
  const [totalForecast, setTotalForecast] = useState(0);
  const [totalPipeline, setTotalPipeline] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function load() {
      const [{ data: deals }, { data: stageRows }] = await Promise.all([
        supabase
          .from('deals')
          .select('stage_id, value')
          .eq('status', 'open'),
        supabase
          .from('pipeline_stages')
          .select('id, name, color, probability'),
      ]);

      if (cancelled) return;

      const stageMap = new Map((stageRows ?? []).map(s => [s.id, s]));
      const byStage = new Map<string, { count: number; total: number }>();

      for (const deal of deals ?? []) {
        const entry = byStage.get(deal.stage_id) ?? { count: 0, total: 0 };
        entry.count++;
        entry.total += Number(deal.value ?? 0);
        byStage.set(deal.stage_id, entry);
      }

      const forecast: StageForecast[] = [];
      for (const [stageId, { count, total }] of byStage.entries()) {
        const stage = stageMap.get(stageId);
        if (!stage) continue;
        const prob = (stage.probability ?? 20) / 100;
        forecast.push({
          stageId,
          stageName: stage.name,
          stageColor: stage.color,
          probability: stage.probability ?? 20,
          dealsCount: count,
          totalValue: total,
          weightedValue: total * prob,
        });
      }

      forecast.sort((a, b) => b.totalValue - a.totalValue);

      const pipelineTotal = forecast.reduce((s, f) => s + f.totalValue, 0);
      const forecastTotal = forecast.reduce((s, f) => s + f.weightedValue, 0);

      setStages(forecast);
      setTotalPipeline(pipelineTotal);
      setTotalForecast(forecastTotal);
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Revenue Forecast</h3>
        <span className="ml-auto text-xs text-muted-foreground">Weighted by stage probability</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : stages.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-6">No open deals</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted/50 border border-border p-3">
              <p className="text-xs text-muted-foreground">Pipeline Value</p>
              <p className="text-lg font-bold text-foreground mt-1">{formatCurrency(totalPipeline, currency)}</p>
            </div>
            <div className="rounded-lg bg-primary/10 border border-primary/20 p-3">
              <p className="text-xs text-primary/80">Weighted Forecast</p>
              <p className="text-lg font-bold text-primary mt-1">{formatCurrency(totalForecast, currency)}</p>
            </div>
          </div>

          <div className="space-y-2">
            {stages.map(stage => (
              <div key={stage.stageId} className="flex items-center gap-3">
                <span
                  className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: stage.stageColor }}
                />
                <span className="text-sm text-foreground flex-1 truncate">{stage.stageName}</span>
                <span className="text-xs text-muted-foreground w-8 text-right">{stage.probability}%</span>
                <span className="text-xs text-muted-foreground w-4 text-center">×</span>
                <span className="text-sm font-medium text-foreground w-24 text-right">
                  {formatCurrency(stage.totalValue, currency)}
                </span>
                <span className="text-xs text-muted-foreground w-4 text-center">=</span>
                <span className="text-sm font-semibold text-primary w-24 text-right">
                  {formatCurrency(stage.weightedValue, currency)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
