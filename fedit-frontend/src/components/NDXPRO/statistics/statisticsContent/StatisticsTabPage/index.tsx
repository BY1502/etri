import {
  currentDate,
  currentTab,
  selectedItems,
  TabList,
} from 'components/NDXPRO/statistics/store';
import { ITab } from 'components/NDXPRO/statistics/types';
import { useLayoutEffect } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import StatisticsTab from './StatisticsTab';
import StatisticsTabContainer from './StatisticsTabContainer';
import StatisticsTabList from './StatisticsTabList';
import DataModelStatistics from './StatisticsTabPanel/DataModelStatistics';
import SourceStatistics from './StatisticsTabPanel/SourceStatistics';

function StatisticsTabPage() {
  const [selectedItem, setSelectedItem] = useRecoilState(selectedItems);
  const date = useRecoilValue(currentDate);
  const tab = useRecoilValue(currentTab);

  useLayoutEffect(() => {
    setSelectedItem({ dataModel: '', provider: '' });
  }, [date]);

  return (
    <div className="statistics-tab-page">
      <StatisticsTabList>
        {TabList.map((tab: ITab) => (
          <StatisticsTab
            key={tab.tabPath}
            tabName={tab.tabName}
            tabPath={tab.tabPath}
          />
        ))}
      </StatisticsTabList>
      <StatisticsTabContainer>
        {tab === 'DataModelStatistics' && <DataModelStatistics />}
        {tab === 'DataModelSourceStatistics' && <SourceStatistics />}
      </StatisticsTabContainer>
    </div>
  );
}

export default StatisticsTabPage;
