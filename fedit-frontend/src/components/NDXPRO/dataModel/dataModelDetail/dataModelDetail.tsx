import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useParams } from 'react-router';
import { useRecoilState } from 'recoil';

import { getModel, putIsReady } from 'apis/NDXPRO/modelApi';

import { modelSelectedAtom } from 'store/dataModel/dataModelAtom';

import { RectangleButton } from 'components/NDXPRO/common/button/button';
import ErrorBox from 'components/NDXPRO/common/errorBox';

import DataModelTitle from 'components/NDXPRO/dataModel/dataModelDetail/dataModelTitle';
import DataModelTree from 'components/NDXPRO/dataModel/dataModelTree/dataModelTree';
import StatisticsError from 'components/NDXPRO/statistics/statisticsContent/statisticsError';
import StatisticsLoading from 'components/NDXPRO/statistics/statisticsContent/statisticsLoading';
import { IDataModel } from 'types/dataModelTypes';

import DataModelAttribute from 'components/NDXPRO/dataModel/dataModelDetail/dataModelAttribute';
import DataModelInfo from 'components/NDXPRO/dataModel/dataModelDetail/dataModelInfo';
import { useModel } from 'components/NDXPRO/dataModel/hooks/useModel';

function DataModelDetail() {
  const params = useParams();

  const { data, isLoading, isFetching, error } = useQuery<IDataModel>({
    queryKey: ['getModel', params.modelId],
    queryFn: () => getModel({ dataModelId: params.modelId }),
  });

  const [modelSelected, setModelSelected] = useRecoilState(modelSelectedAtom);

  useEffect(() => {
    setModelSelected([]);
  }, [params.modelId]);

  const { update, errorMessage, setErrorMessage } = useModel(data);

  if (isLoading || isFetching) {
    return <StatisticsLoading />;
  }

  if (error || !data) {
    return <StatisticsError />;
  }

  return (
    <div className="new-data-model-detail">
      <DataModelTitle id={data.type} uri={data.id} isReady={data.isReady} />
      {errorMessage !== '' && (
        <ErrorBox text={errorMessage} closer={() => setErrorMessage('')} />
      )}
      <div className="new-data-model-detail-main">
        <DataModelInfo />
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
      {data.isReady === false && (
        <div className="new-data-model-detail-bottom">
          <RectangleButton
            type="etc"
            text="Change status to Ready"
            onClick={() => {
              if (
                !window.confirm(
                  'Ready 상태로 변경하시겠습니까? 수정중인 항목이 초기화됩니다.',
                )
              ) {
                return;
              }
              putIsReady(data.type)
                .then((res) => {
                  alert(res);
                  window.location.reload();
                })
                .catch((err) => setErrorMessage(err.response.data.detail));
            }}
          />
          <RectangleButton type="add" text="Submit" onClick={update} />
        </div>
      )}
    </div>
  );
}

export default DataModelDetail;
