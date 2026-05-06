import { useState } from 'react';
import { useRecoilState } from 'recoil';

import { refreshState } from 'store/atoms/common';
import useDidMountEffect from './useDidMountEffect';

interface useRefreshTriggerReturnType {
  refreshTrigger: () => void;
  registerUpdateFuncion: (updateFunction: (() => void)[]) => void;
}

function useRefreshTrigger(): useRefreshTriggerReturnType {
  const [isRefresh, setRefresh] = useRecoilState(refreshState);
  const [registeredFunctions, setRegisteredFunctions] = useState<
    (() => void)[]
  >([]);

  useDidMountEffect(() => {
    registeredFunctions.forEach((excuteFunction) => {
      excuteFunction();
    });

    return () => {
      setRegisteredFunctions([]);
    };
  }, [isRefresh]);

  const refreshTrigger = () => {
    setRefresh((prev) => !prev);
  };
  const registerUpdateFuncion = (updateFunction: (() => void)[]) => {
    setRegisteredFunctions(updateFunction);
  };

  return {
    refreshTrigger,
    registerUpdateFuncion,
  };
}

export default useRefreshTrigger;
