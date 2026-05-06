// import { setupInterceptorsTo } from 'utils/interceptors';
import { statisticsApi as API } from './config';

// setupInterceptorsTo(API);

interface IReqDateWithRange {
  startDate: string;
  endDate: string;
  dataModel?: string;
  provider?: string;
}

export interface IStatistics {
  dataModel?: string;
  provider?: string;
  date: string;
  totalEntities: number;
  successEntities: number;
  failEntities: number;
}

export interface IDateWithRange {
  startDate: string;
  endDate: string;
  dataModel?: string;
  provider?: string;
  statistics: Array<IStatistics>;
}

interface IReqDate {
  date: string;
  dataModel?: string;
}

interface IDateMonth {
  year: number;
  month: number;
}

export const getStatisticsByDateWithRange: (
  param: IReqDateWithRange | undefined,
) => Promise<IDateWithRange> = async (param: IReqDateWithRange | undefined) => {
  const response = await API.get(`/date-range`, { params: param });
  const { data } = response;
  return data;
};

export const getModelStatisticsList: (
  param?: IReqDate,
) => Promise<any> = async (param?: IReqDate) => {
  const response = await API.get(`/model-type`, { params: param });
  const { data } = response;
  return data;
};

export const getModelStatisticsNameList: (
  param?: IReqDate,
) => Promise<string[]> = async (param?: IReqDate) => {
  const response = await API.get(`/list/model-type`, { params: param });
  const { data } = response;
  return data;
};

export const getSourceStatisticsList: (
  param?: IReqDate,
) => Promise<any> = async (param?: IReqDate) => {
  const response = await API.get(`/provider`, { params: param });
  const { data } = response;
  return data;
};

export const getStatisticsDateList: (
  param?: IDateMonth,
) => Promise<string[]> = async (param?: IDateMonth) => {
  const response = await API.get('/list/date', { params: param });
  const { data } = response;
  return data;
};
