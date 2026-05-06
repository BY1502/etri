import { useEffect } from 'react';
import { useRecoilState } from 'recoil';

import { modelSelectedAtom } from 'store/dataModel/dataModelAtom';

import { RectangleButton } from 'components/NDXPRO/common/button/button';
import ErrorBox from 'components/NDXPRO/common/errorBox';
import DataModelAttribute from 'components/NDXPRO/dataModel/dataModelDetail/dataModelAttribute';
import DataModelInfo from 'components/NDXPRO/dataModel/dataModelDetail/dataModelInfo';
import DataModelTitle from 'components/NDXPRO/dataModel/dataModelDetail/dataModelTitle';
import DataModelTree from 'components/NDXPRO/dataModel/dataModelTree/dataModelTree';
import { useModel } from 'components/NDXPRO/dataModel/hooks/useModel';

const modelInit = {
  id: '',
  type: '',
  isReady: false,
  attributeNames: {},
  attributes: {},
};

function AddDataModelDetail() {
  const [modelSelected, setModelSelected] = useRecoilState(modelSelectedAtom);

  useEffect(() => {
    setModelSelected([]);
  }, []);

  const { create, errorMessage, setErrorMessage } = useModel(modelInit);

  return (
    <div className="new-data-model-detail">
      <DataModelTitle id="Add New Model" uri="" isReady={modelInit.isReady} />
      {errorMessage !== '' && (
        <ErrorBox text={errorMessage} closer={() => setErrorMessage('')} />
      )}
      <div className="new-data-model-detail-main">
        <DataModelInfo EditableType />
        <div className="new-data-model-detail-content">
          <DataModelTree />
          {modelSelected.length !== 0 && (
            <DataModelAttribute
              parentId={modelSelected[0]}
              id={modelSelected[1]}
              onClose={() => setModelSelected([])}
            />
          )}
        </div>
      </div>
      <div className="new-data-model-detail-bottom">
        <RectangleButton type="add" text="Submit" onClick={create} />
      </div>
    </div>
  );
}

export default AddDataModelDetail;
