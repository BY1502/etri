import { atom } from 'recoil';

export const editTargetUserIdState = atom<string | null>({
  key: 'editTargetUserState',
  default: null,
});
