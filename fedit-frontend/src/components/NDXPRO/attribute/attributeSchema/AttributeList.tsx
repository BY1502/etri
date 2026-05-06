import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { getAttributeAtAttributeSchema } from 'apis/NDXPRO/attributeSchemaApi';
import ItemSVG from 'assets/images/entity.svg';

import { AttributeType } from 'types/attributeSchema';
import { queryStringParser } from 'utils/queryStringParser';

interface IProps {
  attributeSchemaId: string;
}

function AttributeList({ attributeSchemaId }: IProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [attributeDataList, setAttributeDataList] = useState<AttributeType[]>(
    [],
  );

  const updateAttributeDataList = () => {
    getAttributeAtAttributeSchema(attributeSchemaId).then((data) => {
      const attributeList = data.value ? Object.keys(data.value) : [];
      setAttributeDataList(attributeList);
    });
  };

  useEffect(() => {
    updateAttributeDataList();
  }, []);

  useEffect(() => {
    const targetAttributeSchemaId = location.pathname.split('/').at(-1);
    const queryData = queryStringParser(location.search);

    if (queryData.refresh && targetAttributeSchemaId === attributeSchemaId) {
      updateAttributeDataList();
    }
  }, [location.search]);

  const onClickItem = () => {
    navigate(
      `/service-description-tool/model-schema-management/${encodeURIComponent(
        attributeSchemaId,
      )}`,
    );
  };

  return (
    <ul className="accordion-child-ul">
      {attributeDataList.map((attribute) => {
        return (
          <AttributeItem
            key={attribute}
            attribute={attribute}
            onClickItem={onClickItem}
          />
        );
      })}
    </ul>
  );
}

interface IProps1 {
  attribute: string;
  onClickItem: () => void;
}

function AttributeItem({ attribute, onClickItem }: IProps1) {
  return (
    <li className="attribute-item">
      <button type="button" onClick={onClickItem}>
        <i />
        <img src={ItemSVG} alt="" />
        {attribute}
      </button>
    </li>
  );
}

export default AttributeList;
