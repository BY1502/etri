import { useRef, useState } from 'react';

interface ObserverContollerType {
  startObserver: () => void;
  stopObserver: () => void;
}

function useScrollObserver(): {
  observedRef: React.RefObject<HTMLDivElement>;
  isLoading: boolean;
  observerController: ObserverContollerType;
} {
  const [isLoading, setIsLoading] = useState(false);
  const observedRef = useRef<HTMLDivElement>(null);

  const observer = new IntersectionObserver((entitiesData, _) => {
    entitiesData.forEach((entry) => {
      if (entry.isIntersecting) {
        setIsLoading(true);
      } else {
        setIsLoading(false);
      }
    });
  });

  const observerController = {
    startObserver() {
      if (observedRef.current === null) return;
      observer.observe(observedRef.current);
    },
    stopObserver() {
      observer.disconnect();
    },
  };

  return { observedRef, isLoading, observerController };
}

export default useScrollObserver;
