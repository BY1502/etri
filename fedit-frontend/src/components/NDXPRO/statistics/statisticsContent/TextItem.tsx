import lang from '../lang.json';

interface IProps {
  type: string;
  value: string | number;
}

function StatisticsTextItem({ type, value }: IProps) {
  return (
    <div className={`statistics-text-item ${type}`}>
      <span>{lang.en[type as keyof typeof lang.en]}</span>
      <p>{value.toString()}</p>
    </div>
  );
}

export default StatisticsTextItem;
