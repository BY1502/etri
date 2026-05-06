import { ReactComponent as CloseBtn } from 'assets/images/close.svg';
import { useOutSideRef } from 'components/NDXPRO/hooks/useOutSideRef';

import { ReactNode } from 'react';

interface IProps {
  popupTitle: string;
  closePopup: () => void;
  children: ReactNode;
}

function Popup({ popupTitle, closePopup, children }: IProps) {
  const outSideRef = useOutSideRef(closePopup);

  return (
    <div className="mask">
      <div className="popup-wrapper" ref={outSideRef}>
        <div className="popup-header">
          <h3>{popupTitle}</h3>
          <button type="button" onClick={closePopup}>
            <CloseBtn fill="#aaa" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default Popup;
