import { getStatisticsByDateWithRange } from 'apis/NDXPRO/statisticsApi';
import useAsync from 'components/NDXPRO/statistics/hooks/useAsync';
import StatisticsLoading from 'components/NDXPRO/statistics/statisticsContent/statisticsLoading';
import { currentDate } from 'components/NDXPRO/statistics/store';
import { getRangeBefore } from 'components/NDXPRO/statistics/utils';
import { useState } from 'react';
import { useRecoilValue } from 'recoil';
import StatisticsHeader from '../../header';
import lang from '../../lang.json';
import BarChart from '../chart/BarChart';
import DountChart from '../chart/DonutChart';
import StatisticsText from '../Text';
import StatisticsTextItem from '../TextItem';
import StatisticsFixedTopContent from './Content';

const Content = Object.assign(StatisticsFixedTopContent, {
  Bar: BarChart,
  Donut: DountChart,
  Text: StatisticsText,
  TextItem: StatisticsTextItem,
});

function StatisticsFixedTop() {
  const date = useRecoilValue(currentDate);

  const [dataUnit, setDateUnit] = useState(6);

  const currentWeek = getRangeBefore(date, dataUnit);

  const [data, loading, error, fetchData] = useAsync(
    getStatisticsByDateWithRange,
    date,
    currentWeek,
  );

  const currentWeekStatistics = data?.statistics;
  const currentDateStatistics = data?.statistics[data.statistics.length - 1];

  if (loading || !data || error) {
    return (
      <div className="statistics-fixed-top">
        <StatisticsLoading />
      </div>
    );
  }

  return (
    <div className="statistics-fixed-top">
      <StatisticsHeader title={`${date} ${lang.en.allEntityStatistics}`} />
      <Content>
        {!loading && error !== null && <p>{error.message}</p>}
        {!loading && error === null && data && (
          <>
            <Content.Donut props={currentDateStatistics} />
            <Content.Text>
              <Content.TextItem
                type="success"
                value={currentDateStatistics.successEntities.toLocaleString()}
              />
              <Content.TextItem
                type="fail"
                value={currentDateStatistics.failEntities.toLocaleString()}
              />
              <Content.TextItem
                type="total"
                value={currentDateStatistics.totalEntities.toLocaleString()}
              />
            </Content.Text>
            <Content.Bar props={currentWeekStatistics} range={dataUnit} />
          </>
        )}
      </Content>
    </div>
  );
}

export default StatisticsFixedTop;
