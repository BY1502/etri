import { IStatistics } from 'apis/NDXPRO/statisticsApi';

export const useEntityData = (statistics: IStatistics) => {
  const [success, fail, total] = [
    statistics.successEntities,
    statistics.failEntities,
    statistics.totalEntities,
  ];

  const failProbablity = ((fail / total) * 100).toFixed(1);
  const successProbablity = (100 - Number(failProbablity)).toFixed(1);

  return [success, fail, total, failProbablity, successProbablity];
};
