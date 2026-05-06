import { useUserManagement } from 'pages/user-management/hooks/useUserManagement';
import { editTargetUserIdState } from 'pages/user-management/stores/atom';
import { ResUserSearchItem } from 'pages/user-management/types/userManagement';
import { useEffect } from 'react';
import { useRecoilState } from 'recoil';
import './users-list-item.scss';

export default function UsersListItem({
  userDefaultData,
  usersRefetch,
}: {
  userDefaultData: ResUserSearchItem;
  usersRefetch?: () => void;
}) {
  const {
    userInfo,
    editMode,
    edit,
    cancelEdit,
    update,
    remove,
    handleSetUserInfo,
  } = useUserManagement(userDefaultData, usersRefetch);

  const [editTargetUserId, setEditTargetUserId] = useRecoilState(
    editTargetUserIdState,
  );

  const {
    no,
    group,
    id,
    name,
    contact,
    email,
    company,
    registeredDate,
    status,
    role,
  } = userInfo;

  const onClickEditButton = () => {
    setEditTargetUserId(id);
    edit();
  };

  useEffect(() => {
    if (editTargetUserId !== id) {
      cancelEdit();
    }
  }, [editTargetUserId]);

  const renderButtons = () => {
    if (editMode) {
      return (
        <div className="user-list-item__button-wrapper">
          <button
            className="user-list-item__button"
            type="button"
            onClick={update}
          >
            저장
          </button>
          <button
            className="user-list-item__button"
            type="button"
            onClick={cancelEdit}
          >
            취소
          </button>
        </div>
      );
    }

    // if (role.roleName === 'PENDING')
    //   return (
    //     <button
    //       type="button"
    //       style={{ width: '100%' }}
    //       onClick={onClickEditButton}
    //     >
    //       승인
    //     </button>
    //   );

    return (
      <div className="user-list-item__button-wrapper">
        <button
          className="user-list-item__button"
          type="button"
          onClick={onClickEditButton}
        >
          수정
        </button>
        <button
          className="user-list-item__button"
          type="button"
          onClick={remove}
        >
          삭제
        </button>
      </div>
    );
  };

  return (
    <tr className={editMode ? 'edit' : ''} key={no}>
      <td>{no}</td>
      <td>{group}</td>
      <td>{id}</td>
      <td>{name}</td>
      <td>{contact.replace(/-[0-9]+-/, '-****-')}</td>
      <td>{email}</td>
      <td>{company}</td>
      <td>{registeredDate}</td>
      <td>{status}</td>
      <td>{renderButtons()}</td>
    </tr>
  );
}
