import { Link } from 'react-router-dom';
import './announcement.scss';
import { announcementData } from './announcementData';

export default function Announcement() {
  return (
    <div className="announcement">
      <p className="announcement__title">공지사항 목록</p>
      <div className="announcement__table">
        <div className="announcement__header">
          <div>
            <p className="announcement__header-title">
              등록된 게시물 수 {announcementData.length}개
            </p>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>No</th>
              <th>제목</th>
              <th>작성자</th>
              <th>작성일</th>
            </tr>
          </thead>
          <tbody>
            {announcementData.map((announcement: any) => {
              return (
                <tr key={announcement.no}>
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
      </div>
    </div>
  );
}
