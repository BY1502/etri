import { IDataModelAttributeFormat } from 'types/dataModelTypes';

import { atom } from 'recoil';

export interface IModelInfo {
  id?: string;
  type?: string;
  title?: string;
  description?: string;
  reference?: string[];
}

export const modelAttributeAtom = atom<IDataModelAttributeFormat[]>({
  key: 'modelAttribute',
  default: [],
});

export const modelInfoAtom = atom<IModelInfo>({
  key: 'modelInfo',
  default: {
    id: '',
    type: '',
    title: '',
    description: '',
    reference: [],
  },
});

export const modelSelectedAtom = atom<(string | undefined)[]>({
  key: 'modelSelected',
  default: [],
});
