import type { PlaySession } from "@meseta/core";

interface SessionListProps {
  sessions: readonly PlaySession[];
}

export function SessionList({ sessions }: SessionListProps) {
  if (sessions.length === 0) {
    return <p className="empty-message">セッションデータがありません。</p>;
  }

  // 平均時給、最高時給の計算
  const validSessions = sessions.filter((s) => s.durationMinutes >= 5);
  const avgHourly =
    validSessions.length > 0
      ? Math.round(validSessions.reduce((sum, s) => sum + s.hourlyNet, 0) / validSessions.length)
      : 0;

  const maxHourly =
    validSessions.length > 0
      ? Math.max(...validSessions.map((s) => s.hourlyNet))
      : 0;

  return (
    <div className="session-analytics-container">
      <div className="session-stats-cards">
        <div className="session-stat-card">
          <span className="stat-label">総セッション数</span>
          <span className="stat-value">{sessions.length} 回</span>
        </div>
        <div className="session-stat-card">
          <span className="stat-label">平均時給 (5分以上)</span>
          <span className={`stat-value ${avgHourly >= 0 ? "positive" : "negative"}`}>
            {avgHourly > 0 ? "+" : ""}
            {avgHourly.toLocaleString()} <small>N-メセタ/h</small>
          </span>
        </div>
        <div className="session-stat-card">
          <span className="stat-label">最高時給</span>
          <span className="stat-value positive">
            +{maxHourly.toLocaleString()} <small>N-メセタ/h</small>
          </span>
        </div>
      </div>

      <div className="session-table-wrapper">
        <table>
          <thead>
            <tr>
              <th>開始日時</th>
              <th>終了日時</th>
              <th>プレイ時間</th>
              <th>純利益</th>
              <th>メセタ時給 (Net/h)</th>
              <th>アクション数</th>
            </tr>
          </thead>
          <tbody>
            {sessions.slice(0, 30).map((s) => (
              <tr key={s.id}>
                <td className="font-mono">{s.startTime.replace("T", " ")}</td>
                <td className="font-mono">{s.endTime.replace("T", " ")}</td>
                <td>
                  {s.durationMinutes >= 60
                    ? `${Math.floor(s.durationMinutes / 60)}時間 ${s.durationMinutes % 60}分`
                    : `${s.durationMinutes}分`}
                </td>
                <td className={`number-cell font-bold ${s.net >= 0 ? "positive" : "negative"}`}>
                  {s.net > 0 ? "+" : ""}
                  {s.net.toLocaleString()}
                </td>
                <td className={`number-cell font-bold ${s.hourlyNet >= 0 ? "positive" : "negative"}`}>
                  {s.hourlyNet > 0 ? "+" : ""}
                  {s.hourlyNet.toLocaleString()} N-メセタ/h
                </td>
                <td className="number-cell font-mono">{s.actionCount.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
