import type { ItemSalesRanking } from "@meseta/core";

interface ItemRankingsViewProps {
  rankings: readonly ItemSalesRanking[];
}

export function ItemRankingsView({ rankings }: ItemRankingsViewProps) {
  if (rankings.length === 0) {
    return <p className="empty-message">売却が推定されたアイテムがまだありません。</p>;
  }

  return (
    <div className="item-rankings-container">
      <div className="rankings-table-wrapper">
        <table>
          <thead>
            <tr>
              <th>順位</th>
              <th>アイテム名</th>
              <th>販売個数</th>
              <th>総売上額 (額面)</th>
              <th>平均販売単価</th>
              <th>価格帯 (最低 - 最高)</th>
            </tr>
          </thead>
          <tbody>
            {rankings.map((r, i) => (
              <tr key={r.itemName}>
                <td className="number-cell font-mono">{i + 1}</td>
                <td className="font-bold">{r.itemName}</td>
                <td className="number-cell">{r.totalQuantity} 個</td>
                <td className="number-cell font-bold positive">
                  +{r.totalGross.toLocaleString()} N-メセタ
                </td>
                <td className="number-cell font-mono">{r.averagePrice.toLocaleString()}</td>
                <td className="number-cell font-mono">
                  {r.minPrice === r.maxPrice
                    ? r.minPrice.toLocaleString()
                    : `${r.minPrice.toLocaleString()} 〜 ${r.maxPrice.toLocaleString()}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
