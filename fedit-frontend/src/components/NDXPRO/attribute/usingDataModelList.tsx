import { getUsingDataModel } from 'apis/NDXPRO/attributeApi';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

function UsingDataModel() {
  const params = useParams();
  const [modelList, setModelList] = useState([]);

  useEffect(() => {
    if (params.attrId) {
      getUsingDataModel(params.attrId).then((res) => {
        setModelList(res);
      });
    }
  }, []);

  return (
    <div className="attribute-using-data-model">
      <ul className="using-data-model-list">
        {modelList.length === 0 && <li>데이터가 없습니다.</li>}
        {modelList.length !== 0 &&
          modelList.map((e: string) => <li key={e}>{e}</li>)}
      </ul>
    </div>
  );
}

export default UsingDataModel;
