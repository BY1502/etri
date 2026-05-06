import { selectedItems } from 'components/NDXPRO/statistics/store';
import { useRecoilState } from 'recoil';
import NoData from '../../NoData';
import StatisticsDetail from '../common/StatisticsDetail';
import StatisticsTable from '../common/StatisticsTable';

function DataModelStatistics() {
  const [selectedItem, setSelectedItem] = useRecoilState(selectedItems);

  return (
    <div className="data-model-statistics-panel">
      <StatisticsTable type="dataModelStatistics" />
      {selectedItem.dataModel === '' && (
        <div className="statistics-detail">
          <NoData />
        </div>
      )}
      {selectedItem.dataModel !== '' && <StatisticsDetail />}
    </div>
  );
}

export default DataModelStatistics;
