import close from 'assets/images/close.svg';
import { RectangleButton } from 'components/NDXPRO/common/button/button';

interface IProp {
  children: React.ReactNode;
  title?: string;
  closer?: () => void;
  closerText?: string;
  submit?: () => void;
  submitText?: string;
  isBackgroundCloser?: boolean;
}
function Modal({
  children,
  title,
  closer,
  closerText = '닫기',
  submit,
  submitText = '저장',
  isBackgroundCloser,
}: IProp) {
  return (
    <div className="modal-content">
      {isBackgroundCloser && (
        <button className="modal-bg" type="button" onClick={closer} />
      )}
      <div>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" onClick={closer}>
            <img src={close} alt="close" />
          </button>
        </div>
        <div className="modal-child">{children}</div>
        <div className="modal-btns">
          {closer && (
            <RectangleButton type="etc" text={closerText} onClick={closer} />
          )}
          {submit && (
            <RectangleButton type="add" text={submitText} onClick={submit} />
          )}
        </div>
      </div>
    </div>
  );
}

export default Modal;
