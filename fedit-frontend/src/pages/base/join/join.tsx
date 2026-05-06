import { NavLink } from 'react-router-dom';
import './join.scss';

export default function Join() {
  return (
    <div className="join">
      <form className="join__form">
        <p>연합트윈 프레임워크 사용신청</p>
        <div className="join__form-wrapper">
          <div className="join__form-group">
            <p>사용자 그룹</p>
            <select className="join__select">
              <option value="1">운영자</option>
              <option value="2">사용자</option>
            </select>
          </div>
          <div className="join__form-user-information">
            <p>사용자 정보</p>

            <div className="join__form-user-information-list">
              <div className="join__form-input">
                <input
                  className="join__input"
                  type="text"
                  placeholder="아이디"
                />
                <button type="button" className="join__button">
                  중복확인
                </button>
              </div>
              <div className="join__form-input">
                <input
                  className="join__input"
                  type="text"
                  placeholder="비밀번호"
                />
                <input
                  className="join__input"
                  type="text"
                  placeholder="비밀번호 확인"
                />
              </div>
              <div className="join__form-input">
                <input className="join__input" type="text" placeholder="성명" />
                <input
                  className="join__input"
                  type="text"
                  placeholder="소속기관"
                />
              </div>
              <input className="join__input" type="text" placeholder="이메일" />
            </div>
          </div>
          <div className="join__form-footer">
            <button type="submit" className="join__button-submit">
              사용 신청
            </button>
            <p>
              이미 계정이 있으신가요?{' '}
              <span>
                <NavLink to="/login">로그인</NavLink>
              </span>
            </p>
          </div>
        </div>
      </form>
    </div>
  );
}
