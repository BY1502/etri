import { useState } from 'react';
import { Link } from 'react-router-dom';
import { announcementData } from '../announcementData';
import './announcement-management.scss';

export default function AnnouncementManagement() {
  const [checkedItems, setCheckedItems] = useState<any>({});
  const [isAllChecked, setIsAllChecked] = useState(false);

  const handleCheckChange = (event: any, id: any) => {
    if (id === 'all') {
      setIsAllChecked(event.target.checked);
      const newCheckedItems: any = {};
      announcementData.forEach((announcement: any) => {
        newCheckedItems[announcement.no] = event.target.checked;
      });
      setCheckedItems(newCheckedItems);
    } else {
      setCheckedItems({ ...checkedItems, [id]: event.target.checked });
    }
  };

  return (
    <div className="announcement-management">
      <p className="announcement-management__title">공지사항 목록</p>
      <div className="announcement-management__table">
        <div className="announcement-management__header">
          <div>
            <p className="announcement-management__header-title">
              등록된 게시물 수 {announcementData.length}개
            </p>
          </div>
          <div className="announcement-management__header-buttons">
            <button
              className="announcement-management__header-button"
              type="button"
            >
              수정
            </button>
            <button
              className="announcement-management__header-button"
              type="button"
            >
              삭제
            </button>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>
                <input
                  className="announcement-management__checkbox"
                  type="checkbox"
                  checked={isAllChecked}
                  onChange={(event) => handleCheckChange(event, 'all')}
                />
              </th>
              <th>No</th>
              <th>제목</th>
              <th>작성자</th>
              <th>작성일</th>
            </tr>
          </thead>
          <tbody>
            {announcementData.map((announcement: any) => {
              return (
                <tr
                  key={announcement.no}
                  className={checkedItems[announcement.no] ? 'checked' : ''}
                >
                  <td>
                    <input
                      className="announcement-management__checkbox"
                      type="checkbox"
                      checked={checkedItems[announcement.no] || false}
                      onChange={(event) =>
                        handleCheckChange(event, announcement.no)
                      }
                    />
                  </td>
                  <td>{announcement.no}</td>
                  <td>
                    <Link
                      to={`/notice-board-management/announcement-management/${announcement.no}`}
                    >
                      {announcement.title}
                    </Link>
                  </td>
                  <td>{announcement.author}</td>
                  <td>{announcement.date}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="announcement-management__button-div">
          <Link to="/notice-board-management/announcement-register">
            <button className="announcement-management__button" type="button">
              글쓰기
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
