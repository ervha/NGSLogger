import { BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { use as registerEcharts, init } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";
import type { ActionCountRow } from "./workers/protocol.ts";

// 折れ線やカレンダーは後で足す。今は件数の棒だけを登録して、初回の読み込みを小さくする。
registerEcharts([BarChart, GridComponent, TooltipComponent, CanvasRenderer]);

interface ActionChartProps {
  counts: readonly ActionCountRow[];
}

export function ActionChart({ counts }: ActionChartProps) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const chart = init(element);
    chart.setOption({
      tooltip: { trigger: "axis" },
      grid: { left: 48, right: 16, top: 16, bottom: 80 },
      xAxis: {
        type: "category",
        data: counts.map((row) => row.action),
        axisLabel: { rotate: 40, color: "#3d3832" },
      },
      yAxis: { type: "value", minInterval: 1, axisLabel: { color: "#3d3832" } },
      series: [
        {
          type: "bar",
          data: counts.map((row) => row.count),
          itemStyle: { color: "#0f6e6b" },
        },
      ],
    });
    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.dispose();
    };
  }, [counts]);

  return <div ref={host} className="chart" role="img" aria-label="アクションごとの行数" />;
}
