import calendarIcon from 'assets/images/calendar_icon.svg';
import close from 'assets/images/close.svg';

import { useRecoilState, useRecoilValue } from 'recoil';
import { asideToggle, currentDate } from '../store';
import StatisticsDatePicker from './StatisticsDatePicker';

function StatisticsDateTitle() {
  const [date, setDate] = useRecoilState(currentDate);

  return <h6 className="aside-title">{date}</h6>;
}

function StatisticsAsideToggleBtn() {
  const [isToggle, setIsToggle] = useRecoilState(asideToggle);

  return (
    <button
      className="aside-toggle-btn"
      type="button"
      onClick={() => setIsToggle(!isToggle)}
    >
      <img src={isToggle ? close : calendarIcon} alt="close" />
    </button>
  );
}

function StatisticsAsideIndex() {
  const isToggle = useRecoilValue(asideToggle);

  return (
    <div className={isToggle ? 'statistics-aside' : 'statistics-aside hide'}>
      <div className="aside-top">
        <StatisticsAsideToggleBtn />
        {isToggle && <StatisticsDateTitle />}
      </div>
      {isToggle && <StatisticsDatePicker />}
    </div>
  );
}

export default StatisticsAsideIndex;
