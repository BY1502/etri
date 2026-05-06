import { useMemo, useState } from 'react';
import ReactQuill from 'react-quill';
import './announcement-register.scss';

const formats = [
  'font',
  'header',
  'bold',
  'italic',
  'underline',
  'strike',
  'blockquote',
  'list',
  'bullet',
  'indent',
  'link',
  'align',
  'color',
  'background',
  'size',
  'h1',
];

export default function AnnouncementRegister() {
  const [values, setValues] = useState<any>();

  const modules = useMemo(() => {
    return {
      toolbar: {
        container: [
          [{ size: ['small', false, 'large', 'huge'] }],
          [{ align: [] }],
          ['bold', 'italic', 'underline', 'strike'],
          [{ list: 'ordered' }, { list: 'bullet' }],
          [
            {
              color: [],
            },
            { background: [] },
          ],
        ],
      },
    };
  }, []);

  const handleClick = () => {
    console.log(values);
  };

  return (
    <div className="announcement-register">
      <p className="announcement-register__title">공지사항 등록</p>
      <div className="announcement-register__input-container">
        <div className="announcement-register__input-wrapper">
          <p className="announcement-register__input-title">제목</p>
          <input type="text" className="announcement-register__input" />
        </div>
        <div className="announcement-register__input-wrapper">
          <p className="announcement-register__input-title">내용</p>
          <ReactQuill
            theme="snow"
            modules={modules}
            formats={formats}
            className="announcement-register__quill"
            style={{ height: '500px', width: '100%' }}
            onChange={setValues}
          />
        </div>
        <div className="announcement-register__button-div">
          <button
            type="button"
            className="announcement-register__button"
            onClick={handleClick}
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
