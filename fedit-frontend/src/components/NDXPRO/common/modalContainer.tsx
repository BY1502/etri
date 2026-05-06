import closeIcon from 'assets/images/close.svg';

import { ComponentProps } from 'react';

interface IProps extends ComponentProps<'div'> {
  title: string;
  closeEvent: () => void;
}

function ModalContainer({
  title,
  closeEvent,
  children,
  ...defaultProps
}: IProps) {
  return (
    <div className="modal-container">
      <div>
        <header>
          <h3>{title}</h3>
          <button type="button" onClick={closeEvent} className="close-btn">
            <img src={closeIcon} alt="close" />
          </button>
        </header>
        <section {...defaultProps}>{children}</section>
      </div>
    </div>
  );
}

export default ModalContainer;
