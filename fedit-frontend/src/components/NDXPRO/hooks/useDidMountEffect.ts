import { useEffect, useRef } from 'react';

function useDidMountEffect(callback: () => void, dependencyArray: any[]) {
  const didMount = useRef(false);

  useEffect(() => {
    if (didMount.current === true) {
      callback();
    } else {
      didMount.current = true;
    }
  }, dependencyArray);
}

export default useDidMountEffect;
