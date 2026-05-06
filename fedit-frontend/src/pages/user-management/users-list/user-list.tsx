import { ResUserSearchItem } from '../types/userManagement';
import './users-list-item.scss';

import UsersListItem from './users-list-item';

const data: ResUserSearchItem[] = [
  {
    no: 1,
    group: '관리자',
    id: 'shkim1199',
    name: '김성훈',
    contact: '010-4206-9647',
    email: 'shkim1199@e8ight.kr',
    company: '이에이트',
    registeredDate: '2024.09.23',
    status: '활동',
    role: 'SUPER_ADMIN',
  },
  {
    no: 2,
    group: '관리자',
    id: 'jwkim',
    name: '김재웅',
    contact: '010-5750-5595',
    email: 'jwkim@e8ight.co.kr',
    company: '이에이트',
    registeredDate: '2024.09.23',
    status: '활동',
    role: 'SUPER_ADMIN',
  },
  {
    no: 3,
    group: '관리자',
    id: 'sy.ryu',
    name: '류수영',
    contact: '010-2836-5548',
    email: 'sy.ryu@e8ight.kr',
    company: '이에이트',
    registeredDate: '2024.09.23',
    status: '활동',
    role: 'SUPER_ADMIN',
  },
  {
    no: 4,
    group: '관리자',
    id: 'yesbe',
    name: '박연희',
    contact: '010-6292-0202',
    email: 'yesbe@e8ight.kr',
    company: '이에이트',
    registeredDate: '2024.09.23',
    status: '활동',
    role: 'SUPER_ADMIN',
  },
  {
    no: 5,
    group: '운영자',
    id: 'yountae.kim',
    name: '김연태',
    contact: '010-9486-7090',
    email: 'yountae.kim@e8ight.kr',
    company: '이에이트',
    registeredDate: '2024.09.23',
    status: '활동',
    role: 'ADMIN',
  },
  {
    no: 6,
    group: '운영자',
    id: 'cwk1412',
    name: '최원기',
    contact: '010-2762-6822',
    email: 'cwk1412@keti.re.kr',
    company: '한국전자기술연구원',
    registeredDate: '2024.09.23',
    status: '활동',
    role: 'ADMIN',
  },
  {
    no: 7,
    group: '일반',
    id: 'seong',
    name: '성은숙',
    contact: '010-5487-0213',
    email: 'seong@e8ight.kr',
    company: '이에이트',
    registeredDate: '2024.09.23',
    status: '활동',
    role: 'REGULAR_USER',
  },
];

export default function UsersList() {
  return (
    <div className="users-list">
      <p className="users-list__title">회원목록</p>
      <div className="users-list__header">
        <div className="users-list__component">
          <p className="users-list__component-title">사용자 그룹</p>
          <div className="users-list__component-separator" />
          <select className="users-list__select">
            <option value="1">전체</option>
            <option value="2">사용자</option>
          </select>
        </div>
        <div className="users-list__component">
          <p className="users-list__component-title">상태구분</p>
          <div className="users-list__component-separator" />
          <select className="users-list__select">
            <option value="1">전체</option>
            <option value="2">사용자</option>
          </select>
        </div>
        <div className="users-list__component">
          <p className="users-list__component-title">키워드 검색</p>
          <div className="users-list__component-separator" />
          <select className="users-list__select">
            <option value="1">아이디</option>
            <option value="2">사용자</option>
          </select>
          <input className="users-list__input" type="text" />
        </div>
      </div>

      <div className="users-list__table">
        <p>전체 {data.length} 건</p>
        <table>
          <thead>
            <tr>
              <th>No</th>
              <th>사용자그룹</th>
              <th>아이디</th>
              <th>성명</th>
              <th>연락처</th>
              <th>이메일</th>
              <th>소속기관</th>
              <th>가입일</th>
              <th>상태구분</th>
              <th>가입상태</th>
            </tr>
          </thead>
          <tbody>
            {data.map((userInfo) => {
              return (
                <UsersListItem key={userInfo.no} userDefaultData={userInfo} />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
