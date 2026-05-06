import { useRecoilValue } from 'recoil';
import { clickable } from '../store';
import StatisticsFixedTop from './statisticsFixedTop';
import StatisticsTabPage from './StatisticsTabPage';

function CollectedStatisticsIndex() {
  const toggleClickable = useRecoilValue(clickable);
  return (
    <div className="statistics-content">
      {!toggleClickable && <div className="statistics-loading-full" />}
      <StatisticsFixedTop />
      <StatisticsTabPage />
    </div>
  );
}

export default CollectedStatisticsIndex;
