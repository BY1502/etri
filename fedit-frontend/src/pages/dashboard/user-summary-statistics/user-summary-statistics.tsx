import { ArcElement, Chart as ChartJS, Legend, Tooltip } from 'chart.js';
import { Pie } from 'react-chartjs-2';
import './user-summary-statistics.scss';

ChartJS.register(ArcElement, Tooltip, Legend);

const data = {
  labels: ['green', 'red', 'grey'],
  datasets: [
    {
      //   label: 'My First Dataset',
      data: [300, 50, 100],
      backgroundColor: [
        'rgba(120,222,36,204)',
        'rgba(255,99,71,204)',
        'rgba(119,119,119,204)',
      ],
      borderColor: [
        'rgba(120,222,36,204)',
        'rgba(255,99,71,204)',
        'rgba(119,119,119,204)',
      ],
      hoverOffset: 1,
    },
  ],
};

const options = {
  plugins: {
    legend: {
      display: false,
    },
  },
};

export default function UserSummaryStatistics() {
  return (
    <div className="user-summary-statistics">
      <div className="user-summary-statistics__wrapper">
        <div className="user-summary-statistics__left-div">
          <div>
            <p>회원 통계</p>
          </div>
          <Pie data={data} options={options} />
        </div>
        <div className="user-summary-statistics__right-div">
          <div className="user-summary-statistics__bar-container">
            <div>
              <p className="user-summary-statistics__right-div-title">
                전체회원
              </p>
            </div>
            <div className="user-summary-statistics__bar-div">
              <div className="user-summary-statistics__bar-line">
                <p>18,745 명</p>
              </div>
            </div>
          </div>
          <div className="user-summary-statistics__bar-container">
            <div>
              <p className="user-summary-statistics__right-div-title">
                활동회원
              </p>
            </div>
            <div className="user-summary-statistics__bar-div">
              <div className="user-summary-statistics__bar-line green">
                <p>18,745 명</p>
              </div>
            </div>
          </div>
          <div className="user-summary-statistics__bar-container">
            <div>
              <p className="user-summary-statistics__right-div-title">
                휴면회원
              </p>
            </div>
            <div className="user-summary-statistics__bar-div">
              <div className="user-summary-statistics__bar-line gray">
                <p>18,745 명</p>
              </div>
            </div>
          </div>
          <div className="user-summary-statistics__bar-container">
            <div>
              <p className="user-summary-statistics__right-div-title">
                탈퇴회원
              </p>
            </div>
            <div className="user-summary-statistics__bar-div">
              <div className="user-summary-statistics__bar-line brown">
                <p>18,745 명</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
