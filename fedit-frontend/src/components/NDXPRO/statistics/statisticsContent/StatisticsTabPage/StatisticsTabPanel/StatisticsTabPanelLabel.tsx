interface IProps {
  title: string;
  sub?: string;
}
function StatisticsTabPanelLabel({ title, sub }: IProps) {
  return (
    <div className="statistics-detail-title">
      <h6>{title}</h6>
      <p>{sub}</p>
    </div>
  );
}

export default StatisticsTabPanelLabel;
