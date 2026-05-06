import { getStatisticsByDateWithRange } from 'apis/NDXPRO/statisticsApi';
import useAsync from 'components/NDXPRO/statistics/hooks/useAsync';
import { useEntityData } from 'components/NDXPRO/statistics/hooks/useEntityData';
import { currentDate, selectedItems } from 'components/NDXPRO/statistics/store';
import { getRangeBefore } from 'components/NDXPRO/statistics/utils';
import { useState } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import lang from '../../../lang.json';
import BarChart from '../../chart/BarChart';
import DountChart from '../../chart/DonutChart';
import StatisticsError from '../../statisticsError';
import StatisticsLoading from '../../statisticsLoading';
import StatisticsText from '../../Text';
import StatisticsTextItem from '../../TextItem';
import StatisticsTabPanelLabel from '../StatisticsTabPanel/StatisticsTabPanelLabel';
import StatisticsDetailText from './StatisticsDetailText';
import StatisticsLabel from './StatisticsLabel';

function StatisticsDetail() {
  const date = useRecoilValue(currentDate);
  const [dataUnit, setDataUnit] = useState(6);
  const currentWeek = getRangeBefore(date, dataUnit);
  const [selectedItem, setSelectedItem] = useRecoilState(selectedItems);

  const config = {
    ...currentWeek,
    dataModel: selectedItem.dataModel,
    provider: selectedItem.provider,
  };

  const [data, loading, error, fetchData] = useAsync(
    getStatisticsByDateWithRange,
    selectedItem,
    config,
  );

  const Text = Object.assign(StatisticsText, {
    TextItem: StatisticsTextItem,
  });

  if (loading || !data) {
    return (
      <div className="statistics-detail">
        <StatisticsLoading />
      </div>
    );
  }

  if (error) {
    return (
      <div className="statistics-detail">
        <StatisticsError err={error} />
      </div>
    );
  }

  const currentWeekStatistics = data?.statistics;
  const currentDateStatistics = data?.statistics[data.statistics.length - 1];

  const [success, fail, total, failProbablity, successProbablity] =
    useEntityData(currentDateStatistics);

  return (
    <div className="statistics-detail">
      <StatisticsTabPanelLabel
        title={
          selectedItem.provider ? selectedItem.provider : selectedItem.dataModel
        }
        sub={selectedItem.provider ? selectedItem.dataModel : ''}
      />
      <div className="statistics-detail-content">
        <div className="statistics-detail-top">
          <DountChart props={currentDateStatistics} isDonutChart />
          <Text>
            <Text.TextItem type="success" value={`${successProbablity}%`} />
            <Text.TextItem type="fail" value={`${failProbablity}%`} />
          </Text>
          <div className="statistics-detail-text-wrapper">
            <StatisticsDetailText value={success}>
              <StatisticsLabel type="success" text={lang.en.success} />
            </StatisticsDetailText>
            <StatisticsDetailText value={fail}>
              <StatisticsLabel type="fail" text={lang.en.fail} />
            </StatisticsDetailText>
            <StatisticsDetailText value={total}>
              <StatisticsLabel type="total" text={lang.en.total} />
            </StatisticsDetailText>
          </div>
        </div>

        <BarChart props={currentWeekStatistics} range={dataUnit} />
      </div>
    </div>
  );
}
export default StatisticsDetail;
