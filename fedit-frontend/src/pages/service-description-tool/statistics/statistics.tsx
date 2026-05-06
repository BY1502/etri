// import StatisticsAsideIndex from 'components/NDXPRO/statistics/statisticsAside';
// import StatisticsContentIndex from 'components/NDXPRO/statistics/statisticsContent';
import StatisticsAsideIndex from 'components/NDXPRO/statistics/statisticsAside';
import StatisticsContentIndex from 'components/NDXPRO/statistics/statisticsContent';
import { StatisticsStore } from 'components/NDXPRO/statistics/store';

function Statistics() {
  return (
    <StatisticsStore>
      <div className="statistics">
        <StatisticsAsideIndex />
        <StatisticsContentIndex />
      </div>
    </StatisticsStore>
  );
}

export default Statistics;
