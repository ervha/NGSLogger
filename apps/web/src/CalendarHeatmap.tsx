import { useMemo, useState } from "react";
import type { DailySummary } from "@meseta/core";

interface CalendarHeatmapProps {
  daily: readonly DailySummary[];
}

export function CalendarHeatmap({ daily }: CalendarHeatmapProps) {
  const dailyMap = useMemo(() => {
    const map = new Map<string, DailySummary>();
    for (const d of daily) {
      map.set(d.date, d);
    }
    return map;
  }, [daily]);

  // 利用可能な月リスト（YYYY-MM）
  const months = useMemo(() => {
    const set = new Set<string>();
    for (const d of daily) {
      set.add(d.date.slice(0, 7));
    }
    const list = [...set].sort().reverse();
    if (list.length === 0) {
      list.push(new Date().toISOString().slice(0, 7));
    }
    return list;
  }, [daily]);

  const [selectedMonth, setSelectedMonth] = useState<string>(() => months[0] ?? "");

  const activeMonth = selectedMonth || months[0] || new Date().toISOString().slice(0, 7);

  // 選択月のカレンダーセル配列を生成
  const calendarDays = useMemo(() => {
    const [yearStr, monthStr] = activeMonth.split("-");
    const year = parseInt(yearStr ?? "2026", 10);
    const month = parseInt(monthStr ?? "10", 10);

    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const totalDays = lastDay.getDate();
    const startWeekDay = firstDay.getDay(); // 0 = 日曜

    const days: { date: string; dayNum: number; summary?: DailySummary }[] = [];

    // 先頭の余白
    for (let i = 0; i < startWeekDay; i += 1) {
      days.push({ date: "", dayNum: 0 });
    }

    for (let d = 1; d <= totalDays; d += 1) {
      const dateStr = `${activeMonth}-${String(d).padStart(2, "0")}`;
      days.push({
        date: dateStr,
        dayNum: d,
        summary: dailyMap.get(dateStr),
      });
    }

    return days;
  }, [activeMonth, dailyMap]);

  return (
    <div className="calendar-heatmap-container">
      <div className="calendar-header">
        <h4>収支カレンダー</h4>
        <div className="month-selector">
          <label>
            表示月:
            <select value={activeMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {m.replace("-", "年 ")}月
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="calendar-grid">
        <div className="weekday-header">日</div>
        <div className="weekday-header">月</div>
        <div className="weekday-header">火</div>
        <div className="weekday-header">水</div>
        <div className="weekday-header">木</div>
        <div className="weekday-header">金</div>
        <div className="weekday-header">土</div>

        {calendarDays.map((cell, idx) => {
          if (!cell.dayNum) {
            return <div key={`empty_${idx}`} className="calendar-cell empty" />;
          }

          const sum = cell.summary;
          let cellClass = "calendar-cell active";
          if (!sum) {
            cellClass += " no-log";
          } else if (sum.net > 0) {
            cellClass += " profit";
          } else if (sum.net < 0) {
            cellClass += " loss";
          } else {
            cellClass += " neutral";
          }

          return (
            <div
              key={cell.date}
              className={cellClass}
              title={
                sum
                  ? `${cell.date}\n純利益: ${sum.net > 0 ? "+" : ""}${sum.net.toLocaleString()} N-メセタ\n収入: +${sum.income.toLocaleString()}\n支出: -${sum.expense.toLocaleString()}`
                  : `${cell.date} (ログなし)`
              }
            >
              <span className="cell-day">{cell.dayNum}</span>
              {sum && (
                <span className="cell-amount">
                  {sum.net > 0 ? "+" : ""}
                  {Math.abs(sum.net) >= 1_000_000
                    ? `${(sum.net / 1_000_000).toFixed(1)}M`
                    : Math.abs(sum.net) >= 1_000
                      ? `${(sum.net / 1_000).toFixed(0)}k`
                      : sum.net}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
