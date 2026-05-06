import { clickable, currentTab } from 'components/NDXPRO/statistics/store';
import { ITab } from 'components/NDXPRO/statistics/types';
import { useRecoilState, useRecoilValue } from 'recoil';

function StatisticsTab({ tabName, tabPath }: ITab) {
  const [tab, setTab] = useRecoilState(currentTab);
  const toggleClickable = useRecoilValue(clickable);

  const handleClickTab = () => {
    if (!toggleClickable) {
      return;
    }
    setTab(tabPath);
  };

  return (
    <button
      type="button"
      onClick={handleClickTab}
      className={tab === tabPath ? 'statistics-tab active' : 'statistics-tab'}
    >
      <h6>{tabName}</h6>
    </button>
  );
}

export default StatisticsTab;
