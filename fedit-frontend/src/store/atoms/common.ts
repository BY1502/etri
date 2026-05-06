import { ICustomConfirmState } from 'components/customToast/types';
import { atom } from 'recoil';

export const defaultCustomConfirmState: ICustomConfirmState = {
  text: '',
  isOpen: false,
  confirmAction: () => {},
  cancelAction: () => {},
};

export const customConfirmState = atom<ICustomConfirmState>({
  key: 'customConfirmStateAtom',
  default: defaultCustomConfirmState,
});

export const customToastState = atom<string>({
  key: 'customToastStateAtom',
  default: '',
});

export const loadingMaskState = atom<boolean>({
  key: 'loadingMaskStateAtom',
  default: false,
});

export const testErrorMessageState = atom<string>({
  key: 'testErrorMessageAtom',
  default: '',
});

export const refreshState = atom({
  key: 'dataRefreshState',
  default: false,
});
