import { useEffect, useState } from 'react';
import { NavLink, useParams } from 'react-router-dom';

interface category {
  name: string;
  path: string;
}

function AgentNav() {
  const pages = [
    {
      name: 'Agent Info',
      path: 'agent-info',
    },
    // {
    //   name: 'Agent Logs',
    //   path: 'agent-logs',
    // },
    {
      name: 'Translator',
      path: 'translator',
    },
    {
      name: 'Translator History',
      path: 'translator-history',
    },
    {
      name: 'Add New Agent',
      path: 'new-agent',
    },
    {
      name: 'Agent History',
      path: 'history-agent',
    },
  ];

  const [menu, setMenu] = useState<category[]>([]);

  const params = useParams();
  const activeTabs = params['*'];
  useEffect(() => {
    if (activeTabs === 'new-agent') {
      setMenu(pages.filter((item) => item.path === 'new-agent'));
    } else if (activeTabs === 'history-agent') {
      setMenu(pages.filter((item) => item.path === 'history-agent'));
    } else {
      setMenu(
        pages.filter(
          (item) => item.path !== 'new-agent' && item.path !== 'history-agent',
        ),
      );
    }
  }, [activeTabs]);

  // const menuList = () => {};

  return (
    // <div className="agent-nav-wrapper">
    <div className="agent-nav">
      <ul>
        {menu.map((item) => (
          <NavLink key={item.path} to={item.path}>
            {activeTabs === item.path ? (
              <li className="active">{item.name}</li>
            ) : (
              <li>{item.name}</li>
            )}
          </NavLink>
        ))}
      </ul>
    </div>
    // </div>
  );
}

export default AgentNav;
