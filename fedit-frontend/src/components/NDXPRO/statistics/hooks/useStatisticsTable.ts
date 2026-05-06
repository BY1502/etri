import {
  getModelStatisticsList,
  getModelStatisticsNameList,
  getSourceStatisticsList,
} from 'apis/NDXPRO/statisticsApi';
import { useRecoilValue } from 'recoil';
import { currentDate, selectedItems } from '../store';
import useAsync from './useAsync';

export const useStatisticsTable = (type: string) => {
  const selectedDate = useRecoilValue(currentDate);
  const getDataModelListConfig = { date: selectedDate };
  const selectedItem = useRecoilValue(selectedItems);
  const getSourceListConfig = {
    date: selectedDate,
    dataModel: selectedItem.dataModel,
  };

  const getUseAsync = () => {
    if (type === 'dataModelStatistics') {
      return useAsync(
        getModelStatisticsList,
        selectedDate,
        getDataModelListConfig,
      );
    }
    if (type === 'dataModelNameList') {
      return useAsync(
        getModelStatisticsNameList,
        selectedDate,
        getDataModelListConfig,
      );
    }
    if (type === 'sourceStatistics') {
      return useAsync(
        getSourceStatisticsList,
        selectedItem.dataModel,
        getSourceListConfig,
      );
    }
    return [null, null, null, null];
  };

  return getUseAsync();
};
