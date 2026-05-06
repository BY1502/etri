import 'components/customConfirm/customConfirm.scss';
import { useCustomConfirm } from 'components/customConfirm/hooks/useCustomConfirm';

function CustomConfirmModal() {
  const { customConfirm } = useCustomConfirm();
  const { text, isOpen, confirmAction, cancelAction } = customConfirm;

  if (!isOpen) return <span />;

  return (
    <div className="custom-confirm">
      <div className="custom-confirm__modal">
        <p>{text}</p>
        <div className="custom-confirm__modal__btns">
          <button type="button" onClick={confirmAction}>
            확인
          </button>
          <button type="button" onClick={cancelAction}>
            취소
          </button>
        </div>
      </div>
    </div>
  );
}

export default CustomConfirmModal;
