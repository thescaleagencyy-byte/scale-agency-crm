"use client";

import { useMemo } from "react";
import { getIndustryTerms } from "@/lib/industry-terms";
import type { Deal, PipelineStage } from "@/types";
import {
  DollarSign,
  TrendingUp,
  Target,
  BarChart3,
  Trophy,
  XCircle,
  Info,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { formatCurrency } from "@/lib/currency";

interface PipelineAnalyticsProps {
  stages: PipelineStage[];
  deals: Deal[];
}

/**
 * Weighted pipeline value: value × per-stage probability.
 * First stage ≈ 10%, stages interpolate up to 90% before the final stage,
 * final stage (Won) = 100%. Lost deals excluded.
 */
function computeStageProbability(
  stage: PipelineStage,
  sortedStages: PipelineStage[],
): number {
  const n = sortedStages.length;
  if (n <= 1) return 1;
  const index = sortedStages.findIndex((s) => s.id === stage.id);
  if (index < 0) return 0;
  if (index === n - 1) return 1;
  const slots = n - 1;
  if (slots <= 1) return 0.1;
  const t = index / (slots - 1);
  return 0.1 + t * (0.9 - 0.1);
}

export function PipelineAnalytics({ stages, deals }: PipelineAnalyticsProps) {
  const { defaultCurrency } = useAuth();
  const sortedStages = useMemo(
    () => [...stages].sort((a, b) => a.position - b.position),
    [stages],
  );

  const stats = useMemo(() => {
    const active = deals.filter((d) => d.status !== "lost");
    const openDeals = active.filter((d) => d.status !== "won");

    const totalCount = active.length;
    const totalValue = active.reduce((sum, d) => sum + Number(d.value || 0), 0);
    const avgValue = totalCount > 0 ? totalValue / totalCount : 0;

    const stageById = new Map(sortedStages.map((s) => [s.id, s]));
    const weightedValue = openDeals.reduce((sum, d) => {
      const stage = stageById.get(d.stage_id);
      if (!stage) return sum;
      const prob = computeStageProbability(stage, sortedStages);
      return sum + Number(d.value || 0) * prob;
    }, 0);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonth = (d: Deal) => {
      const ts = d.updated_at ?? d.created_at;
      return ts ? new Date(ts) >= monthStart : false;
    };
    const wonThisMonth = deals.filter(
      (d) => d.status === "won" && thisMonth(d),
    ).length;
    const lostThisMonth = deals.filter(
      (d) => d.status === "lost" && thisMonth(d),
    ).length;

    return {
      totalCount,
      totalValue,
      avgValue,
      weightedValue,
      wonThisMonth,
      lostThisMonth,
    };
  }, [deals, sortedStages]);

  const t = getIndustryTerms()

  return (
    <TooltipProvider>
      <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card/60 p-4 sm:grid-cols-3 xl:grid-cols-6">
        <Metric
          icon={<BarChart3 className="h-4 w-4 text-muted-foreground" />}
          label={`Total ${t.deals.charAt(0).toUpperCase() + t.deals.slice(1)}`}
          value={String(stats.totalCount)}
          tooltip={`Count of every ${t.deal} in this pipeline that isn't marked as ${t.lostDeal}. ${t.wonDeals.charAt(0).toUpperCase() + t.wonDeals.slice(1)} are still included.`}
        />
        <Metric
          icon={<DollarSign className="h-4 w-4 text-primary" />}
          label="Pipeline Value"
          value={formatCurrency(stats.totalValue, defaultCurrency)}
          tooltip={`Sum of the dollar values of all ${t.deals} in this pipeline, excluding ${t.lostDeals}.`}
        />
        <Metric
          icon={<Target className="h-4 w-4 text-blue-400" />}
          label={`Avg ${t.deal.charAt(0).toUpperCase() + t.deal.slice(1)} Size`}
          value={formatCurrency(stats.avgValue, defaultCurrency)}
          tooltip={`Pipeline Value divided by Total ${t.deals.charAt(0).toUpperCase() + t.deals.slice(1)} — the average value of a single non-${t.lostDeal}.`}
        />
        <Metric
          icon={<TrendingUp className="h-4 w-4 text-purple-400" />}
          label="Weighted Value"
          value={formatCurrency(stats.weightedValue, defaultCurrency)}
          tooltip={`Expected revenue: each open ${t.deal}'s value × its stage probability. First stage ≈ 10%, stages progress up to 90%, ${t.wonDeals} = 100%. ${t.lostDeals.charAt(0).toUpperCase() + t.lostDeals.slice(1)} are excluded.`}
        />
        <Metric
          icon={<Trophy className="h-4 w-4 text-primary" />}
          label={`${t.wonDeals.charAt(0).toUpperCase() + t.wonDeals.slice(1).split(' ')[0]} This Month`}
          value={String(stats.wonThisMonth)}
          tooltip={`${t.deals.charAt(0).toUpperCase() + t.deals.slice(1)} marked as ${t.wonDeal} since the first day of the current month.`}
        />
        <Metric
          icon={<XCircle className="h-4 w-4 text-red-400" />}
          label={t.lostThisMonth}
          value={String(stats.lostThisMonth)}
          tooltip={t.lostThisMonthTooltip}
        />
      </div>
    </TooltipProvider>
  );
}

function Metric({
  icon,
  label,
  value,
  tooltip,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tooltip: string;
}) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        <span>{label}</span>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={`How ${label} is calculated`}
                className="ml-auto text-muted-foreground hover:text-foreground focus:outline-none"
              />
            }
          >
            <Info className="h-3 w-3" />
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-left">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      </div>
      <p className="mt-1 text-base font-semibold text-foreground">{value}</p>
    </div>
  );
}
