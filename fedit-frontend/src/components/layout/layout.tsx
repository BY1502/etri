import CustomConfirmModal from 'components/customConfirm/customConfirm';
import CustomToast from 'components/customToast/customToast';
import LoadingMask from 'components/loadingMask/loadingMask';
import Sidebar from 'components/sidebar/sidebar';
import { useRecoilValue } from 'recoil';
import { customConfirmState } from 'store/atoms/common';
import './layout.scss';
interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const isConfirmOpen = useRecoilValue(customConfirmState);

  // console.log(isLoadingMaskOpen);
  return (
    <div className="layout">
      <Sidebar />
      <div className={isConfirmOpen ? `content` : `content backdrop`}>
        {children}
        <CustomConfirmModal />
        <CustomToast />
        <LoadingMask />
      </div>
    </div>
  );
}
