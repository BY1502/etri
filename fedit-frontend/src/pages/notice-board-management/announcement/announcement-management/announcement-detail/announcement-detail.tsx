import { useMemo } from 'react';
import ReactQuill from 'react-quill';
import { useLocation, useNavigate } from 'react-router-dom';
import './announcement-detail.scss';

export default function AnnouncementDetail() {
  const navigate = useNavigate();
  const location = useLocation();

  const goBack = () => {
    if (location.pathname.includes('announcement-management')) {
      navigate('/notice-board-management/announcement-management');
    } else {
      navigate('/notice-board-management/announcement');
    }
  };

  const announcement = {
    no: '0001',
    title: '[공지] 서비스 런칭',
    author: '관리자',
    date: '2024.04.01',
    content: `<p>안녕하십니까</p><p><br></p><p>연합트윈 프레임워크 시스템 점검 일자 알려드립니다.</p><p><br></p><ul><li><strong style="background-color: rgb(255, 255, 0);">일자</strong>: 2024.05.01 10:00 ~ 12:00</li><li><span style="background-color: rgb(255, 255, 0);">문의처</span>: 이에이트</li></ul><p><br></p><p>감사합니다</p>`,
  };

  if (!announcement) {
    return <p>Announcement not found</p>;
  }

  const modules = useMemo(() => {
    return {
      toolbar: null,
    };
  }, []);

  return (
    <div className="announcement-detail">
      <p className="announcement-detail__title">공지사항 보기</p>

      <div className="announcement-detail__header">
        <p className="announcement-detail__header-number">{announcement.no}</p>
        <p className="announcement-detail__header-title">
          {announcement.title}
        </p>

        <button
          className="announcement-detail__header-button"
          type="button"
          onClick={goBack}
        >
          목록으로 이동
        </button>
      </div>
      <div className="announcement-detail__sub-header">
        <p>
          작성자: <span>관리자</span>
        </p>
        <p>
          작성일: <span>2024.04.29 10:00</span>
        </p>
      </div>
      <ReactQuill
        theme="snow"
        modules={modules}
        value={announcement.content}
        readOnly
      />

      <div className="announcement-detail__footer">
        <button type="button">이전</button>
        <button type="button">다음</button>
      </div>
    </div>
  );
}
