import { useEffect } from 'react';
import { useRecoilState } from 'recoil';

import {
  customConfirmState,
  defaultCustomConfirmState,
} from 'store/atoms/common';

export const useCustomConfirm = () => {
  const [customConfirm, setCustomConfirm] = useRecoilState(customConfirmState);

  const init = () => {
    setCustomConfirm(defaultCustomConfirmState);
  };

  const isConfirmed = async (text: string) => {
    try {
      await new Promise((resolve, reject) => {
        setCustomConfirm({
          text,
          isOpen: true,
          confirmAction: resolve,
          cancelAction: reject,
        });
      });
      return true;
    } catch {
      return false;
    } finally {
      init();
    }
  };

  useEffect(() => {
    return () => {
      if (customConfirm.cancelAction) {
        customConfirm.cancelAction();
      }
    };
  }, [customConfirm]);

  return {
    customConfirm,
    isConfirmed,
  };
};
