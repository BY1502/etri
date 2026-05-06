import attrIcon from 'assets/images/entity.svg';
import { NavLink, useParams } from 'react-router-dom';

function PagingList({ pagePath, attrList, listCount }: any) {
  const param = useParams();

  const list = attrList
    ? attrList.map((e: any) => (
        <li key={Math.random()} style={{ height: `${100 / listCount}%` }}>
          {pagePath === 'data-model' && (
            <NavLink
              className={e.type === param['*'] ? 'actives' : ''}
              to={e.type}
            >
              <img src={attrIcon} alt="" />
              <p>{e.type}</p>
              {e.isReady && <p className="type-label isReady">완료</p>}
            </NavLink>
          )}
          {pagePath !== 'data-model' && (
            <NavLink className={e.id === param['*'] ? 'actives' : ''} to={e.id}>
              <img src={attrIcon} alt="" />
              <p>{e.id}</p>
              {e.type !== 'e8ight' && (
                <p className={`type-label ${e.type}`}>{e.type}</p>
              )}
            </NavLink>
          )}
        </li>
      ))
    : [];

  return <div className="attribute-list">{list}</div>;
}

export default PagingList;
