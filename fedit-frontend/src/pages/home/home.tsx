import { ReactComponent as AddBtn } from 'assets/images/add.svg';
import Card from 'components/card/card';
import Layout from 'components/layout/layout';
import { pages as allPages } from 'constants/routePath';
import { useEffect, useState } from 'react';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import './home.scss';

export default function Home() {
  const [showDropdown, setShowDropdown] = useState(false);

  const syncLocalStorageWithCodebase = (savedPages: any) => {
    // Filter out any pages in localStorage that are no longer in allPages
    const validPages = savedPages.filter((savedPage: any) =>
      allPages.some((page) => page.name === savedPage.name),
    );

    // If validPages differ from savedPages, update localStorage
    if (validPages.length !== savedPages.length) {
      localStorage.setItem('pages', JSON.stringify(validPages));
    }

    return validPages;
  };

  const [pages, setPages] = useState(() => {
    const savedPages = localStorage.getItem('pages');
    if (savedPages) {
      const parsedPages = JSON.parse(savedPages);
      return syncLocalStorageWithCodebase(parsedPages);
    }
    return allPages;
  });

  const [checkboxes, setCheckboxes] = useState<any>(() => {
    const savedPages = localStorage.getItem('pages');
    const savedPageNames = savedPages
      ? syncLocalStorageWithCodebase(JSON.parse(savedPages)).map(
          (page: any) => page.name,
        )
      : [];
    return allPages.reduce(
      (acc, page) => ({
        ...acc,
        [page.name]: savedPageNames.includes(page.name),
      }),
      {},
    );
  });

  const handleButtonClick = () => {
    setShowDropdown(!showDropdown);
  };

  const handleCheckboxChange = (event: any) => {
    const { name, checked } = event.target;
    setCheckboxes((prevCheckboxes: any) => {
      const newCheckboxes: any = {
        ...prevCheckboxes,
        [name]: checked,
      };
      customizePages(newCheckboxes);
      return newCheckboxes;
    });
  };

  const handleDivClick = (event: any, name: any) => {
    event.stopPropagation();
    setCheckboxes((prevCheckboxes: any) => {
      const newCheckboxes = {
        ...prevCheckboxes,
        [name]: !prevCheckboxes[name],
      };
      customizePages(newCheckboxes);
      return newCheckboxes;
    });
  };

  const handleKeyDown = (event: any, name: any) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleDivClick(event, name);
    }
  };

  const customizePages = (checkboxes: any) => {
    const selectedPages = allPages.filter((page) => checkboxes[page.name]);
    setPages(selectedPages);
  };

  useEffect(() => {
    localStorage.setItem('pages', JSON.stringify(pages));
  }, [pages]);

  return (
    <Layout>
      <div className="home">
        <div className="home__header">
          <button
            className="home__header-button"
            type="button"
            onClick={handleButtonClick}
          >
            <p>메뉴 커스터마이징</p>
            <AddBtn className="home__header-svg" fill="#aaaaaa" />
          </button>

          {showDropdown && (
            <div
              className={`home__dropdown ${showDropdown ? 'home__show' : ''}`}
            >
              {allPages.flatMap((page) => [
                <div
                  className="home__dropdown-option"
                  key={page.name}
                  onClick={(e) => handleDivClick(e, page.name)}
                  onKeyDown={(e) => handleKeyDown(e, page.name)}
                  role="checkbox"
                  aria-checked={checkboxes[page.name]}
                  tabIndex={0}
                >
                  <input
                    type="checkbox"
                    id={page.name}
                    name={page.name}
                    checked={checkboxes[page.name]}
                    onChange={handleCheckboxChange}
                  />
                  <label htmlFor={page.name}>{page.name}</label>
                </div>,
              ])}
            </div>
          )}
        </div>
        <div className="home__grid">
          {pages.flatMap((page: any) => {
            if (page.childNav) {
              return page.childNav.map((child: any) => (
                <Card
                  key={child.name}
                  path={`${page.path}${child.path}`}
                  icon={child.homeIcon}
                  subtitle={page.name}
                  title={child.name}
                />
              ));
            }
            return (
              <Card
                key={page.name}
                path={page.path}
                icon={page.homeIcon}
                title={page.name}
              />
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
