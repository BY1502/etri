import ArrowUp from 'assets/images/arrow_up.svg';
import { memo, useCallback } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useRecoilValue } from 'recoil';
import { sidebarCollapsedState } from 'store/atoms/sidebar';
import './sidebarItem.scss';

interface SidebarItemProps {
  iconSrc: string;
  title: string;
  path: string;
  childNav?: { name: string; path: string; auth: string }[];
  isExpanded: boolean;
  onExpand: () => void;
  onLinkClick: () => void;
}

function SidebarItem({
  iconSrc,
  title,
  path,
  childNav,
  isExpanded,
  onExpand,
  onLinkClick,
}: SidebarItemProps) {
  const isCollapsed = useRecoilValue(sidebarCollapsedState);
  const location = useLocation();

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (childNav) {
        e.preventDefault();
        onExpand();
      } else {
        onLinkClick();
      }
    },
    [childNav, onExpand, onLinkClick],
  );

  const isActive = childNav
    ? childNav.some((child) => location.pathname.includes(child.path))
    : location.pathname === path;

  return (
    <div className="sidebarItem-main">
      <div className="sidebar-div">
        <NavLink className="link" to={path} onClick={handleClick}>
          <li className="sidebarItem">
            <img className="sidebarItem__icon" src={iconSrc} alt="icon" />
            {isCollapsed && childNav && (
              <div className="sidebarItem__indicator" />
            )}
            <p
              className={`sidebarItem__title ${isCollapsed ? 'collapsed' : ''}`}
            >
              {title}
            </p>
            {childNav && !isCollapsed && (
              <img
                className={`sidebarItem__arrow ${isExpanded ? 'expanded' : ''}`}
                src={ArrowUp}
                alt="arrow-up"
              />
            )}
          </li>
        </NavLink>
      </div>
      {isExpanded && childNav && (
        <div className={isCollapsed ? 'sidebarItem__popup' : ''}>
          {childNav.map((child) => {
            return (
              <NavLink
                key={`${path}/${child.path}`}
                to={`${path}${child.path}`}
                onClick={onLinkClick}
                className={isCollapsed ? 'sidebarItem__child-wrapper' : ''}
              >
                <li
                  className={
                    isCollapsed
                      ? 'sidebarItem__child-collapsed'
                      : 'sidebarItem__child'
                  }
                  style={{
                    backgroundColor:
                      location.pathname.split('/').pop() ===
                      child.path.substring(1)
                        ? `var(--sidebar-hover)`
                        : 'transparent',
                  }}
                >
                  <p>{child.name}</p>
                </li>
              </NavLink>
            );
          })}
        </div>
      )}
    </div>
  );
}
export default memo(SidebarItem);
