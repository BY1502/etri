import 'components/loadingMask/loadingMask.scss';
import { useRecoilValue } from 'recoil';
import { loadingMaskState } from 'store/atoms/common';

function LoadingMask() {
  const isLoadingMaskOpen = useRecoilValue(loadingMaskState);

  if (!isLoadingMaskOpen) return <span />;

  return (
    <div className="loading-mask">
      <div className="loading-mask__spinner" />
    </div>
  );
}

export default LoadingMask;
