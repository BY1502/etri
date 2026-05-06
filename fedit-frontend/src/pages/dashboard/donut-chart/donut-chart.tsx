import { ArcElement, Chart as ChartJS, Legend, Tooltip } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import './donut-chart.scss';

ChartJS.register(ArcElement, Tooltip, Legend);

const data = {
  labels: ['green', 'red', 'grey'],
  datasets: [
    {
      // label: '# of Votes',
      data: [80, 5, 15],
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

const doughnutLabel = {
  id: 'doughnutLabel',
  beforeDatasetsDraw(chart: any, args: any, pluginOptions: any) {
    const { ctx, data } = chart;

    ctx.save();
    const xColor = chart.getDatasetMeta(0).data[0].x;
    const yColor = chart.getDatasetMeta(0).data[0].y;
    ctx.font = 'bold 32px sans-serif';
    ctx.fillStyle = 'black';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('90 점', xColor, yColor);
  },
};

const options = {
  plugins: {
    legend: {
      display: false,
    },
  },
  cutout: '70%',
};

export default function DonutChart() {
  return (
    <div className="donut-chart">
      <div className="donut-chart__wrapper">
        <div className="donut-chart__left-div">
          <p>전체 시스템 성능</p>
          <Doughnut data={data} options={options} plugins={[doughnutLabel]} />
        </div>
        <div className="donut-chart__right-div">
          <div className="donut-chart__right-bar-div">
            <div>
              <p className="donut-chart__right-bar-div-title">
                제주 관광쾌적지수 연합트윈 서비스 (PoC1)
              </p>
            </div>
            <div className="donut-chart__bar-div">
              <div className="donut-chart__bar-line" />
              <p>100점</p>
            </div>
          </div>
          <div className="donut-chart__right-bar-div">
            <div>
              <p className="donut-chart__right-bar-div-title">
                도시통합 연합트윈 서비스
              </p>
            </div>
            <div className="donut-chart__bar-div">
              <div className="donut-chart__bar-line" />
              <p>100점</p>
            </div>
          </div>
          <div className="donut-chart__right-bar-div">
            <div>
              <p className="donut-chart__right-bar-div-title">연합트윈 PoC2</p>
            </div>
            <div className="donut-chart__bar-div">
              <div className="donut-chart__bar-line" />
              <p>100점</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
