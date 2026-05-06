import { AxiosError } from 'axios';
import { useState } from 'react';
import { useRecoilState, useSetRecoilState } from 'recoil';

import { ValueOf } from 'types/common';
// import { deleteUser, updateUser } from 'apis/userApi';
// import { resetRegularUserInitialPassword } from 'apis/regularUserApi';
import { useCustomConfirm } from 'components/customConfirm/hooks/useCustomConfirm';
import { customToastState, loadingMaskState } from 'store/atoms/common';
import { ResUserSearchItem } from '../types/userManagement';

export const useUserManagement = (
  defaultData: ResUserSearchItem,
  usersRefetch?: () => void,
) => {
  const [editMode, setEditMode] = useState<boolean>(false);
  const [userInfo, setUserInfo] = useState<ResUserSearchItem>(defaultData);
  const { isConfirmed } = useCustomConfirm();
  const setCustomToast = useSetRecoilState(customToastState);
  const [isLoadingMaskOpen, setIsLoadingMaskOpen] =
    useRecoilState(loadingMaskState);

  const { id, name, contact, email, registeredDate, status, role } = userInfo;

  const handleSetUserInfo = (
    key: keyof ResUserSearchItem,
    property: ValueOf<ResUserSearchItem>,
  ) => {
    setUserInfo((prev) => {
      return { ...prev, [key]: property };
    });
  };

  const edit = () => {
    setEditMode(true);
  };

  const handleSetCustomToast = (err: any, errorText: string) => {
    const axiosErr = err as AxiosError;
    if (axiosErr.isAxiosError) {
      setCustomToast(err.response?.data?.message || errorText);
    } else {
      setCustomToast(errorText);
    }
  };

  const cancelEdit = () => {
    setUserInfo(defaultData);
    setEditMode(false);
  };

  const update = async () => {
    // if (role.roleName === 'PENDING') {
    //   setCustomToast('사용자 그룹을 선택해주세요.');
    //   return;
    // }

    // if (
    //   userInfo.permissions.length === 0 ||
    //   userInfo.permissions.some(
    //     (permission) => (permission.permissionName as string) === 'NULL',
    //   )
    // ) {
    //   setCustomToast('권한은 최소 1개 이상 선택해주세요.');
    //   return;
    // }

    // if (!department) {
    //   setCustomToast('소속을 입력해주세요.');
    //   return;
    // }

    // const permissions: string[] = userInfo.permissions.map(
    //   (permission) => permission.permissionName,
    // );

    const payload = {
      name,
      contact,
      email,
      status,
      // role: role.roleName,
    };

    try {
      if ((await isConfirmed('저장하시겠습니까?')) === false) return;
      setIsLoadingMaskOpen(true);
      // console.log(id, payload);
      //   await updateUser(id, payload);
      setEditMode(false);
      setCustomToast('저장되었습니다.');
    } catch (error) {
      handleSetCustomToast(error, '에러가 발생했습니다.');
    } finally {
      setIsLoadingMaskOpen(false);
      // usersRefetch();
    }
  };

  const remove = async () => {
    try {
      if ((await isConfirmed('정말로 삭제하시겠습니까?')) === false) return;
      setIsLoadingMaskOpen(true);
      //   await deleteUser(id);
      // usersRefetch();
      setCustomToast('삭제되었습니다.');
    } catch (error) {
      handleSetCustomToast(error, '에러가 발생했습니다.');
    } finally {
      setIsLoadingMaskOpen(false);
    }
  };

  return {
    userInfo,
    editMode,
    edit,
    cancelEdit,
    update,
    remove,
    handleSetUserInfo,
    isLoadingMaskOpen,
  };
};
