import { getAttributeSchema } from 'apis/NDXPRO/attributeSchemaApi';
import arrowRight from 'assets/images/arrow_right.svg';
import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { AttributeSchemaType } from 'types/attributeSchema';
import { queryStringParser } from 'utils/queryStringParser';
import AttributeList from './AttributeList';

function AttributeSchemaList() {
  const location = useLocation();
  const [attributeSchemaListData, setAttributeSchemaListData] = useState<
    AttributeSchemaType[]
  >([]);

  const updateAttributeSchemaListData = () => {
    getAttributeSchema().then((data) => {
      setAttributeSchemaListData(data);
    });
  };

  useEffect(() => {
    updateAttributeSchemaListData();
  }, []);

  useEffect(() => {
    const queryData = queryStringParser(location.search);

    if (queryData.refresh) {
      updateAttributeSchemaListData();
    }
  }, [location]);

  return (
    <ul className="accordion-menu-ul">
      {attributeSchemaListData?.map((attributeSchema) => {
        return (
          <AttributeSchemaItem
            key={attributeSchema}
            attributeSchema={attributeSchema}
          />
        );
      })}
    </ul>
  );
}

interface IProps {
  attributeSchema: string;
}

function AttributeSchemaItem({ attributeSchema }: IProps) {
  const [toggle, setToggle] = useState(false);
  const onClickHandler = (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setToggle(!toggle);
  };

  return (
    <li key={attributeSchema} className="attribute-schema-item">
      <NavLink to={encodeURIComponent(attributeSchema)}>
        <button type="button" onClick={onClickHandler}>
          <img
            src={arrowRight}
            alt=""
            style={{ transform: toggle ? 'rotate(90deg)' : '' }}
          />
        </button>
        <span>{attributeSchema}</span>
      </NavLink>
      {toggle && <AttributeList attributeSchemaId={attributeSchema} />}
    </li>
  );
}

export default AttributeSchemaList;
