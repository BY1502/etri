import { Chart } from 'react-chartjs-2';

import { IStatistics } from 'apis/NDXPRO/statisticsApi';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import {
  barChartColorSet,
  chartOption,
} from 'components/NDXPRO/statistics/utils/chartUtils';
import { Dispatch, SetStateAction, useEffect, useState } from 'react';

ChartJS.register(
  LinearScale,
  CategoryScale,
  BarElement,
  PointElement,
  LineElement,
  Legend,
  Tooltip,
  LineController,
  BarController,
);

interface IBarChart {
  props: Array<IStatistics>;
  range: number;
}

interface IList {
  date: Array<string>;
  totalEntities: Array<number>;
  successEntities: Array<number>;
  failEntities: Array<number>;
}

function BarChart({ props, range }: IBarChart) {
  const [lists, setLists]: [
    IList | undefined,
    Dispatch<SetStateAction<IList | undefined>>,
  ] = useState();

  const colorSet = barChartColorSet({
    range,
  });

  useEffect(() => {
    if (props) {
      const list: IList = {
        date: [],
        totalEntities: [],
        successEntities: [],
        failEntities: [],
      };

      props.map((item: any) => {
        list.date.push(item.date);
        list.totalEntities.push(item.totalEntities);
        list.successEntities.push(item.successEntities);
        list.failEntities.push(item.failEntities);

        return true;
      });
      setLists(list);
    }
  }, [props]);

  const chartData = {
    labels: lists?.date,
    datasets: [
      {
        type: 'line' as const,
        label: 'Total',
        borderColor: 'rgba(150, 150, 150, 0.5)',
        backgroundColor: 'rgba(150, 150, 150, 0.5)',
        borderWidth: 3,
        data: lists?.totalEntities,
      },
      {
        type: 'bar' as const,
        label: 'Success',
        backgroundColor: colorSet.successColorSet,
        data: lists?.successEntities,
      },
      {
        type: 'bar' as const,
        label: 'Fail',
        backgroundColor: colorSet.failColorSet,
        data: lists?.failEntities,
      },
    ],
  };

  const option = {
    barPercentage: 0.5,
    scales: {
      x: {
        stacked: true,
      },
      y: {
        stacked: true,
      },
    },
  };

  return (
    <div className="statistics-chart-bar">
      <Chart
        type="bar"
        data={chartData}
        options={{ ...chartOption, ...option }}
      />
    </div>
  );
}

export default BarChart;
