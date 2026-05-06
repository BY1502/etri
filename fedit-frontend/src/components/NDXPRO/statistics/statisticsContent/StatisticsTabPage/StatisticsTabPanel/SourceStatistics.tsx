import { selectedItems } from 'components/NDXPRO/statistics/store';
import { useLayoutEffect } from 'react';
import { useRecoilState } from 'recoil';
import NoData from '../../NoData';
import StatisticsDetail from '../common/StatisticsDetail';
import StatisticsTable from '../common/StatisticsTable';
import StatisticsTableNameOnly from '../common/StatisticsTableNameOnly';

function SourceStatistics() {
  const [selectedItem, setSelectedItem] = useRecoilState(selectedItems);

  useLayoutEffect(() => {
    setSelectedItem({ ...selectedItem, provider: '' });
  }, [selectedItem.dataModel]);

  return (
    <div className="provider-statistics-panel">
      <StatisticsTableNameOnly type="dataModelNameList" />
      {selectedItem.dataModel === '' && (
        <div className="statistics-table">
          <NoData />
        </div>
      )}
      {selectedItem.dataModel !== '' && (
        <StatisticsTable type="sourceStatistics" />
      )}
      {selectedItem.provider === '' && (
        <div className="statistics-detail">
          <NoData />
        </div>
      )}
      {selectedItem.provider !== '' && <StatisticsDetail />}
    </div>
  );
}

export default SourceStatistics;
