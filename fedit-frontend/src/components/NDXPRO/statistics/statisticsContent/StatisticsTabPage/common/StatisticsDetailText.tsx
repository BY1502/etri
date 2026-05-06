interface IProps {
  children: React.ReactNode;
  value: number | string;
}

function StatisticsDetailText({ children, value }: IProps) {
  return (
    <li className="statistics-detail-text">
      {children}
      <p className="statistics-detail-text-value">{value?.toLocaleString()}</p>
    </li>
  );
}

export default StatisticsDetailText;
