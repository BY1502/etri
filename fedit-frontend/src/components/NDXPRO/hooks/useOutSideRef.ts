import { useEffect, useRef } from 'react';

export function useOutSideRef(closePopup: () => void) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const targetNode = event.target as Node;

      if (ref.current && !ref.current.contains(targetNode)) {
        closePopup();
      }
    };

    document.addEventListener('click', handleOutsideClick);

    return () => {
      document.removeEventListener('click', handleOutsideClick);
    };
  }, []);

  return ref;
}
