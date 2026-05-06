import { IStatisticsLabel } from 'components/NDXPRO/statistics/types';

function StatisticsLabel({ type, text }: IStatisticsLabel) {
  return (
    <p className={`${type} statistics-label`}>
      <span />
      {text}
    </p>
  );
}

export default StatisticsLabel;
