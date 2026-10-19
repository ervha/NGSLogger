import { BarChart, LineChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { use as registerEcharts, init } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";
import type { LedgerAnalytics } from "@meseta/core";

registerEcharts([BarChart, LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

interface MesetaDashboardProps {
  analytics: LedgerAnalytics;
}

export function MesetaDashboard({ analytics }: MesetaDashboardProps) {
  const chartHost = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = chartHost.current;
    if (!el || analytics.daily.length === 0) return;

    const chart = init(el);
    const dates = analytics.daily.map((d) => d.date);
    const incomes = analytics.daily.map((d) => d.income);
    const expenses = analytics.daily.map((d) => d.expense);
    const nets = analytics.daily.map((d) => d.net);

    chart.setOption({
      tooltip: {
        trigger: "axis",
        valueFormatter: (val: number) => `${val?.toLocaleString() ?? 0} N-メセタ`,
      },
      legend: {
        data: ["収入", "支出", "純利益"],
        top: 0,
        textStyle: { color: "#3d3832" },
      },
      grid: { left: 80, right: 24, top: 40, bottom: 40 },
      xAxis: {
        type: "category",
        data: dates,
        axisLabel: { color: "#3d3832" },
      },
      yAxis: {
        type: "value",
        axisLabel: {
          color: "#3d3832",
          formatter: (v: number) => {
            if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
            if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
            return `${v}`;
          },
        },
      },
      series: [
        {
          name: "収入",
          type: "bar",
          data: incomes,
          itemStyle: { color: "#10b981" },
        },
        {
          name: "支出",
          type: "bar",
          data: expenses,
          itemStyle: { color: "#ef4444" },
        },
        {
          name: "純利益",
          type: "line",
          data: nets,
          itemStyle: { color: "#0f6e6b" },
          lineStyle: { width: 3 },
          symbol: "circle",
          symbolSize: 6,
        },
      ],
    });

    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.dispose();
    };
  }, [analytics.daily]);

  return (
    <section className="dashboard-panel" aria-label="メセタ収支ダッシュボード">
      <header className="dashboard-header">
        <h2>メセタ収支 & マイショップ分析</h2>
      </header>

      {/* KPI カード */}
      <div className="kpi-grid">
        <div className="kpi-card profit">
          <span className="kpi-label">純利益</span>
          <span className={`kpi-value ${analytics.totalNet >= 0 ? "positive" : "negative"}`}>
            {analytics.totalNet > 0 ? "+" : ""}
            {analytics.totalNet.toLocaleString()}
            <small> N-メセタ</small>
          </span>
        </div>
        <div className="kpi-card income">
          <span className="kpi-label">総収入</span>
          <span className="kpi-value">
            +{analytics.totalIncome.toLocaleString()}
            <small> N-メセタ</small>
          </span>
        </div>
        <div className="kpi-card expense">
          <span className="kpi-label">総支出</span>
          <span className="kpi-value">
            -{analytics.totalExpense.toLocaleString()}
            <small> N-メセタ</small>
          </span>
        </div>
        <div className="kpi-card shop">
          <span className="kpi-label">マイショップ受取額</span>
          <span className="kpi-value">
            {analytics.shopSummary.totalIncomeTaken.toLocaleString()}
            <small> N-メセタ</small>
          </span>
          <span className="kpi-sub">
            (手数料引かれ額: {analytics.shopSummary.totalFeePaid.toLocaleString()})
          </span>
        </div>
      </div>

      {/* 収支推移チャート */}
      {analytics.daily.length > 0 && (
        <div className="chart-wrapper">
          <h3>日別収支の推移</h3>
          <div ref={chartHost} className="chart" />
        </div>
      )}

      {/* マイショップ売却推定レポート */}
      <div className="shop-analytics-section">
        <h3>マイショップ出品・売却状況</h3>
        <div className="shop-status-chips">
          <span className="status-chip open">出品中: {analytics.shopSummary.openListings}件</span>
          <span className="status-chip sold">売却推定済: {analytics.shopSummary.soldListings}件</span>
          <span className="status-chip withdrawn">取下済: {analytics.shopSummary.withdrawnListings}件</span>
          {analytics.shopSummary.ambiguousListings > 0 && (
            <span className="status-chip ambiguous">未特定: {analytics.shopSummary.ambiguousListings}件</span>
          )}
        </div>

        {analytics.recentSales.length > 0 && (
          <div className="recent-sales-list">
            <h4>売上回収と売却推定アイテム</h4>
            <table>
              <thead>
                <tr>
                  <th>回収日時</th>
                  <th>回収額</th>
                  <th>売上額（額面）</th>
                  <th>売却推定アイテム</th>
                </tr>
              </thead>
              <tbody>
                {analytics.recentSales.map((sale, i) => (
                  <tr key={`${sale.takenAt}_${i}`}>
                    <td>{sale.takenAt.replace("T", " ")}</td>
                    <td className="number-cell font-bold">+{sale.amount.toLocaleString()}</td>
                    <td className="number-cell font-mono">{sale.gross.toLocaleString()}</td>
                    <td>
                      {sale.items.map((it, idx) => (
                        <div key={idx} className={sale.isCertain ? "item-certain" : "item-candidate"}>
                          {it}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 日別テーブル */}
      {analytics.daily.length > 0 && (
        <div className="daily-table-section">
          <h3>日別収支内訳</h3>
          <table>
            <thead>
              <tr>
                <th>日付</th>
                <th>収入</th>
                <th>支出</th>
                <th>純利益</th>
                <th>ショップ受取</th>
                <th>換金</th>
                <th>ショップ購入</th>
                <th>NPC購入</th>
              </tr>
            </thead>
            <tbody>
              {analytics.daily.map((d) => (
                <tr key={d.date}>
                  <td className="font-mono">{d.date}</td>
                  <td className="number-cell positive">+{d.income.toLocaleString()}</td>
                  <td className="number-cell negative">
                    {d.expense > 0 ? `-${d.expense.toLocaleString()}` : "0"}
                  </td>
                  <td className={`number-cell font-bold ${d.net >= 0 ? "positive" : "negative"}`}>
                    {d.net > 0 ? "+" : ""}
                    {d.net.toLocaleString()}
                  </td>
                  <td className="number-cell font-mono">{d.breakdown.shopTakes.toLocaleString()}</td>
                  <td className="number-cell font-mono">{d.breakdown.exchanges.toLocaleString()}</td>
                  <td className="number-cell font-mono">{d.breakdown.shopPurchases.toLocaleString()}</td>
                  <td className="number-cell font-mono">{d.breakdown.npcPurchases.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
