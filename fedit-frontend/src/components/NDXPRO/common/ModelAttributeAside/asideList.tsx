import StatisticsLoading from 'components/NDXPRO/statistics/statisticsContent/statisticsLoading';
import { ReactNode } from 'react';

function AsideList({
  isFetching,
  children,
}: {
  isFetching: boolean;
  children: ReactNode;
}) {
  if (isFetching) {
    return <StatisticsLoading />;
  }

  return <div className="aside-list">{children}</div>;
}

export default AsideList;
