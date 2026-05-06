import ArrowRight from 'assets/images/arrow_right.svg';
import HomeIcon from 'assets/images/home_icon.svg';
import LogoutIcon from 'assets/images/logout.svg';
import { pages } from 'constants/routePath';
import { useCallback, useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useRecoilState } from 'recoil';
import { sidebarCollapsedState } from 'store/atoms/sidebar';
import './sidebar.scss';
import SidebarItem from './sidebarItem/sidebarItem';

export default function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useRecoilState(sidebarCollapsedState);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [apiItemExpanded, setApiItemExpanded] = useState(false);
  const location = useLocation();

  const toggleCollapse = useCallback(
    () => setIsCollapsed((prev) => !prev),
    [setIsCollapsed],
  );

  const handleLinkClick = useCallback(() => setExpandedItem(null), []);

  useEffect(() => {
    const currentPage = pages.find((page) => {
      if (page.childNav) {
        return page.childNav.some((child) =>
          location.pathname.includes(child.path),
        );
      }
      return location.pathname.includes(page.path);
    });

    if (currentPage) {
      setExpandedItem(currentPage.name);
    } else {
      setExpandedItem(null);
    }
  }, [location]);

  return (
    <div className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <NavLink to="/">
        <div className="sidebar__header">
          <img src={HomeIcon} alt="icon" />
          <p>연합트윈 프레임워크</p>
        </div>
      </NavLink>
      <button
        type="button"
        className="sidebar__collapse"
        onClick={toggleCollapse}
      >
        <img
          className={`arrow ${isCollapsed ? 'rotate' : ''}`}
          src={ArrowRight}
          alt="arrow-right"
        />
      </button>
      <ul className="sidebar__items">
        {pages.map((page) => (
          <SidebarItem
            key={page.name}
            iconSrc={page.icon}
            title={page.name}
            path={page.path}
            childNav={page.childNav}
            isExpanded={expandedItem === page.name}
            onExpand={() =>
              setExpandedItem((prev) => (prev === page.name ? null : page.name))
            }
            onLinkClick={handleLinkClick}
          />
        ))}
        {/* <div className="sidebarItem-main">
          <div className="sidebar-div">
            <li
              className="sidebarItem"
              onClick={() => setApiItemExpanded((prev) => !prev)}
            >
              <img className="sidebarItem__icon" src={APIIcon} alt="icon" />
              {isCollapsed && <div className="sidebarItem__indicator" />}
              <p
                className={`sidebarItem__title ${
                  isCollapsed ? 'collapsed' : ''
                }`}
              >
                API 및 문서 링크
              </p>
              <img
                className={`sidebarItem__arrow ${
                  apiItemExpanded ? 'expanded' : ''
                }`}
                src={ArrowUp}
                alt="arrow-up"
              />
            </li>
          </div>
          {apiItemExpanded && (
            <>
              <div className={isCollapsed ? 'sidebarItem__popup' : ''}>
                <a
                  className={isCollapsed ? 'sidebarItem__child-wrapper' : ''}
                  href="http://dev.jinwoosi.co.kr:8083/swagger-ui/index.html#/AirQuality/find_23"
                  target="_blank"
                  rel="noreferrer"
                >
                  <li
                    className={
                      isCollapsed
                        ? 'sidebarItem__child-collapsed'
                        : 'sidebarItem__child'
                    }
                  >
                    <p>제주시</p>
                  </li>
                </a>
              </div>
              <div className={isCollapsed ? 'sidebarItem__popup' : ''}>
                <a
                  className={isCollapsed ? 'sidebarItem__child-wrapper' : ''}
                  href="https://www.softhills.net/SHDC/VIZWide3D/vizwide3d.html"
                  target="_blank"
                  rel="noreferrer"
                >
                  <li
                    className={
                      isCollapsed
                        ? 'sidebarItem__child-collapsed'
                        : 'sidebarItem__child'
                    }
                  >
                    <p>VIZWide3D 사용 가이드</p>
                  </li>
                </a>
              </div>
            </>
          )}
        </div> */}
      </ul>

      <div className="sidebar__footer">
        <NavLink
          className="sidebar__footer-item logout"
          to="/model-information-viewer"
        >
          {/* <img src={RegisterIcon} alt="icon" /> */}
          <p>3D 모델 뷰어</p>
        </NavLink>
        <NavLink
          className="sidebar__footer-item logout"
          to="/register-union-twin"
        >
          <img src={LogoutIcon} alt="icon" />
          <p>로그아웃</p>
        </NavLink>
      </div>
    </div>
  );
}
