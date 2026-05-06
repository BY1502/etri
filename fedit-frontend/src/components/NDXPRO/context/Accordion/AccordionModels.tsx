import { NavLink } from 'react-router-dom';

import { getContextVersion } from 'apis/NDXPRO/contextApi';
import EntityImg from 'assets/images/entity.svg';
import { useEffect, useState } from 'react';
import { ContextVersionResponse, ContextVersionType } from 'types/context';

interface IProps {
  context: Array<string>;
  pagePath: string;
  // params?: any;
}

function AccordionModels({ context, pagePath }: IProps) {
  const [contextVersionInfoList, setContextVersionInfoList] =
    useState<ContextVersionResponse>([]);

  useEffect(() => {
    getContextVersion({ params: { contextUrl: context[1] } }).then(
      (response) => {
        setContextVersionInfoList(response);
      },
    );
  }, []);

  return (
    <ul className="accordion-model">
      {contextVersionInfoList.map((contextVersionInfo: ContextVersionType) => (
        <NavLink
          key={contextVersionInfo.url}
          to={{
            pathname: `/service-description-tool/model-context-management/${encodeURIComponent(
              contextVersionInfo.url,
            )}`,
          }}
        >
          {contextVersionInfo.version && (
            <li key={contextVersionInfo.url}>
              <span />
              <img src={EntityImg} alt="" />
              <p>{contextVersionInfo.version}</p>
            </li>
          )}
        </NavLink>
      ))}
    </ul>
  );
}

export default AccordionModels;
