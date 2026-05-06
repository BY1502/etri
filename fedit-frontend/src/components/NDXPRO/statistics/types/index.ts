export interface IResponse {
  date: string;
  dataModel: string;
  provider: 'string';
  status: 'string';
  totalEntities: number;
  successEntities: number;
  failEntities: number;
}
export interface IError {
  type: string;
  title: string;
  detail: string;
  code: number;
}

export interface ITab {
  tabName: string;
  tabPath: string;
}

export interface ISummary {
  provider?: string;
  dataModel?: string;
  totalEntities: number;
  successEntities: number;
  failEntities: number;
}

export interface ITableSearchConfig {
  dataModel?: string;
  provider?: string;
  date: string;
}

export interface IStatisticsLabel {
  type: string;
  text: string;
}
