import { atom, RecoilRoot } from 'recoil';
import lang from '../lang.json';
import { getDate } from '../utils';

export const currentDate = atom<string>({
  key: 'currentDate',
  default: `${getDate(new Date(), -1)}`,
});

export const asideToggle = atom<boolean>({
  key: 'asideToggle',
  default: true,
});

export const TabList = [
  { tabName: lang.en.dataModelStatistics, tabPath: 'DataModelStatistics' },
  {
    tabName: lang.en.dataModelSourceStatistics,
    tabPath: 'DataModelSourceStatistics',
  },
];

export const currentTab = atom<string>({
  key: 'currentTab',
  default: TabList[0].tabPath,
});

interface ISelectedItem {
  dataModel: string;
  provider: string;
}

export const selectedItems = atom<ISelectedItem>({
  key: 'selectedItem',
  default: {
    dataModel: '',
    provider: '',
  },
});

export const clickable = atom<any>({
  key: 'clickable',
  default: true,
});

export function StatisticsStore({ children }: { children: React.ReactNode }) {
  return <RecoilRoot>{children}</RecoilRoot>;
}
