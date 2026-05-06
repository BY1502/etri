import React, { useEffect, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteAgentModelAttributeSource,
  getAgentModelAttributeSources,
  postAgentModelAttributeSource,
} from 'apis/NDXPRO/IngestApi';
import { getModel } from 'apis/NDXPRO/modelApi';
import RectangleButton2 from 'components/NDXPRO/common/button/rectangleButton2';
import Select from 'components/NDXPRO/common/select';
import { useRecoilValue } from 'recoil';
import { AgentMode, agentState } from 'store/atoms/ingestAtom';
import { ReqPostAgentModelAttributeSource } from 'types/ingest';

interface ModelAttributeRowContainerProps {
  modelType: string;
  agentMode: AgentMode;
}

function ModelAttributeRowContainer({
  modelType,
  agentMode,
}: ModelAttributeRowContainerProps) {
  const agentData = useRecoilValue(agentState);

  const [addSourceMode, setAddSourceMode] = useState<boolean>(false);

  const [targetAttribute, setTargetAttribute] = useState<string>('');

  const [targetSource, setTargetSource] = useState<string>('');

  const [attributesByModelType, setAttributesByModelType] = useState<string[]>(
    [],
  );

  const queryClient = useQueryClient();

  const { data: modelDetail } = useQuery({
    queryKey: ['modelDetail', modelType],
    queryFn: () => getModel({ dataModelId: modelType }),
  });

  const { data: modelAttributeSources } = useQuery({
    queryKey: ['modelAttributeSources', agentData.id, modelType],
    queryFn: () => getAgentModelAttributeSources(agentData.id, { modelType }),
  });

  const modelAttributeSourceMutation = useMutation({
    mutationFn: ({
      agentId,
      payload,
    }: {
      agentId: number;
      payload: ReqPostAgentModelAttributeSource;
    }) => postAgentModelAttributeSource(agentId, payload),
  });

  const deleteAttributeSourceMutation = useMutation({
    mutationFn: ({
      agentId,
      attributeSourceId,
    }: {
      agentId: number;
      attributeSourceId: number;
    }) => deleteAgentModelAttributeSource(agentId, attributeSourceId),
  });

  useEffect(() => {
    if (modelDetail === undefined) return;

    const attributes = Object.keys(modelDetail.attributeNames);

    if (attributes.length === 0) {
      alert(`There's no attribute in this data model: ${modelType}`);
      return;
    }

    setTargetAttribute(attributes[0]);
    setAttributesByModelType(attributes);
  }, [modelDetail]);

  const validation = () => {
    if (modelAttributeSources === undefined) return false;

    if (
      modelAttributeSources
        .map((source: any) => source.attributeName)
        .includes(targetAttribute)
    ) {
      alert(`already registered attribute source: **${targetAttribute}**`);
      return false;
    }

    if (targetSource === '') {
      alert('source name is empty');
      return false;
    }

    return true;
  };

  const handleAddAttributeSource = (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (validation() === false) return;

    modelAttributeSourceMutation.mutate(
      {
        agentId: agentData.id,
        payload: {
          modelType,
          attributeName: targetAttribute,
          sourceName: targetSource,
        },
      },
      {
        onSuccess: () => {
          alert('success to add attribute source.');
          setTargetSource('');
          queryClient.invalidateQueries({
            queryKey: ['modelAttributeSources'],
          });
        },
        onError: () => {
          alert('failed to add attribute source.');
        },
      },
    );
  };

  const handleDeleteAttributeSource = (targetSourceId: number) => {
    if (
      window.confirm('Are you sure to delete this attribute source?') === false
    )
      return;

    deleteAttributeSourceMutation.mutate(
      {
        agentId: agentData.id,
        attributeSourceId: targetSourceId,
      },
      {
        onSuccess: () => {
          alert('success to delete attribute source.');
          queryClient.invalidateQueries({
            queryKey: ['modelAttributeSources'],
          });
        },
        onError: () => {
          alert('failed to delete attribute source.');
        },
      },
    );
  };

  return (
    <>
      {modelAttributeSources &&
        modelAttributeSources.map((attributeSource: any) => {
          return (
            <tr key={attributeSource.id} className="attribute-row">
              <td className="ellipsis">ㄴ {attributeSource.attributeName}</td>
              <td className="source-content">
                <div>
                  <span>source:</span>
                  <strong className="ellipsis">
                    {attributeSource.sourceName}
                  </strong>
                </div>
                <RectangleButton2
                  theme="red"
                  style={{ padding: '2px 6px' }}
                  type="button"
                  onClick={() =>
                    handleDeleteAttributeSource(attributeSource.id)
                  }
                >
                  delete
                </RectangleButton2>
              </td>
              {agentMode === 'edit' && <td className="checkbox" />}
            </tr>
          );
        })}
      <tr className="attribute-row">
        <td>
          {addSourceMode === false ? (
            <RectangleButton2
              theme="blue"
              style={{ padding: '2px 6px' }}
              type="button"
              onClick={() => setAddSourceMode(true)}
            >
              Add Source
            </RectangleButton2>
          ) : (
            <Select
              selectedValue={targetAttribute}
              onChange={(e) => setTargetAttribute(e.target.value)}
              dataList={attributesByModelType}
            />
          )}
        </td>
        <td>
          {addSourceMode && (
            <form
              className="source-content"
              onSubmit={handleAddAttributeSource}
            >
              <label htmlFor="source">source: </label>
              <input
                id="source"
                type="text"
                style={{ flex: '1' }}
                value={targetSource}
                onChange={(event) => setTargetSource(event.target.value)}
                placeholder="input source name..."
              />

              <RectangleButton2
                type="submit"
                theme="blue"
                style={{ padding: '2px 6px' }}
              >
                add
              </RectangleButton2>
              <RectangleButton2
                type="button"
                theme="gray"
                style={{ padding: '2px 6px' }}
                onClick={() => setAddSourceMode(false)}
              >
                cancel
              </RectangleButton2>
            </form>
          )}
        </td>
        {agentMode === 'edit' && <td className="checkbox" />}
      </tr>
    </>
  );
}

export default ModelAttributeRowContainer;
