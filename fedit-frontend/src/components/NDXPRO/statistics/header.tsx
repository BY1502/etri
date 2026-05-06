function StatisticsHeader({ title }: { title: string }) {
  return (
    <div className="statistics-header">
      <h3 className="statistics-title">{title}</h3>
    </div>
  );
}

export default StatisticsHeader;
