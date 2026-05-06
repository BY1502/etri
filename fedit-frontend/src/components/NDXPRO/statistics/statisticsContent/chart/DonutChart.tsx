import { IStatistics } from 'apis/NDXPRO/statisticsApi';
import { ArcElement, Chart as ChartJS, Legend, Tooltip } from 'chart.js';
import {
  chartOption,
  donutChartColorSet,
} from 'components/NDXPRO/statistics/utils/chartUtils';
import { Pie } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

const option = {};

const DoughnutOption = {
  // offset: 10,
  cutout: '75%',
};

function DountChart({
  props,
  isDonutChart,
}: {
  props: IStatistics;
  isDonutChart?: boolean;
}) {
  const colorSet = donutChartColorSet();

  const chartData = {
    labels: ['Success', 'Fail'],
    datasets: [
      {
        data: [props.successEntities, props.failEntities],
        backgroundColor: colorSet,
        hoverBackgroundColor: colorSet,
        hoverOffset: 0,
        borderWidth: 2,
        borderColor: colorSet,
      },
    ],
  };

  if (props.totalEntities === 0) {
    return (
      <div className="statistics-chart-donut skeleton">
        <div className="doughnut-center-text">
          <span>No data</span>
        </div>
      </div>
    );
  }

  return (
    <div className="statistics-chart-donut">
      <Pie
        data={chartData}
        options={
          isDonutChart ? { ...chartOption, ...DoughnutOption } : chartOption
        }
      />
      {isDonutChart && (
        <div className="doughnut-center-text">
          <p>{props.successEntities.toLocaleString()}</p>
          <span>/ {props.totalEntities.toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}

export default DountChart;
