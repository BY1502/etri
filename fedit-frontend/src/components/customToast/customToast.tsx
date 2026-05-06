import 'components/customToast/customToast.scss';
import { useEffect } from 'react';
import { useRecoilState } from 'recoil';

import { customToastState } from 'store/atoms/common';

function CustomToast() {
  const [customToast, setCustomToast] = useRecoilState(customToastState);

  useEffect(() => {
    if (customToast !== '') {
      setTimeout(() => {
        setCustomToast('');
      }, 2000);
    }
  }, [customToast]);

  if (customToast === '') return <span />;

  return (
    <div className="custom-toast">
      <div className="custom-toast__modal">
        <strong>{customToast}</strong>
      </div>
    </div>
  );
}

export default CustomToast;
