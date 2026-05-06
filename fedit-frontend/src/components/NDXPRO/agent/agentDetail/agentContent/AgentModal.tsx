import { getContextInfoData, getContextVone } from 'apis/NDXPRO/contextApi';
import Modal from 'components/NDXPRO/common/modal';
import React, { Dispatch, SetStateAction, useEffect, useState } from 'react';
import { useRecoilState } from 'recoil';
import { agentModelState } from 'store/atoms/ingestAtom';
import { ContextVersionResponse } from 'types/context';

interface DataModelType {
  [key: string]: string;
}

interface IProps {
  setToggle: Dispatch<SetStateAction<boolean>>;
}

function AgentModal({ setToggle }: IProps) {
  const [agentModel, setAgentModel] = useRecoilState(agentModelState);

  const [dataModelList, setDataModelList] = useState<string[]>([]);
  const [selectedContext, setSelectedContext] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [contextVersionInfoList, setContextVersionInfoList] =
    useState<ContextVersionResponse>([]);

  const onChangeSelectBox = (
    e: React.ChangeEvent<HTMLSelectElement>,
    type: string,
  ) => {
    if (type === 'Context') setSelectedContext(e.target.value);
    if (type === 'Model') setSelectedModel(e.target.value);
  };

  useEffect(() => {
    getContextVone()
      .then((res) => {
        const filterList = res.filter((item) => !item.url.includes('ngsi-ld'));
        setContextVersionInfoList(filterList);
        if (filterList[0] !== undefined) {
          setSelectedContext(filterList[0].url);
        }
      })
      .catch((error) => {
        console.log(error);
      });
  }, []);

  useEffect(() => {
    if (selectedContext) {
      getContextInfoData({ contextUrl: selectedContext })
        .then((res: DataModelType) => {
          const dataModelList = Object.keys(res).filter((dataModel) =>
            dataModel[0].match(/[A-Z]/),
          );
          setDataModelList(dataModelList);
          setSelectedModel(dataModelList[0]);
        })
        .catch((error) => {
          alert('서버에 문제가 생겼습니다. 개발팀에 문의주세요.');
          console.log(error);
        });
    }
  }, [selectedContext]);

  const addDataModels = () => {
    setAgentModel([
      ...agentModel,
      {
        modelType: selectedModel,
        context: selectedContext,
      },
    ]);
  };

  return (
    <Modal
      closer={() => setToggle(false)}
      submit={() => addDataModels()}
      title="Add New Models"
    >
      <div className="agent-modal-wrapper">
        <div className="agent-modal">
          <table className="agent-modal-table">
            <tbody>
              <tr>
                <th>Context</th>
                <td>
                  <select onChange={(e) => onChangeSelectBox(e, 'Context')}>
                    {contextVersionInfoList.map((item) => {
                      return (
                        <option key={item.url} value={item.url}>
                          {item.url}
                        </option>
                      );
                    })}
                  </select>
                </td>
              </tr>
              <tr>
                <th>Data-Model</th>
                <td>
                  <select onChange={(e) => onChangeSelectBox(e, 'Model')}>
                    {dataModelList.map((item) => {
                      return (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      );
                    })}
                  </select>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}

export default AgentModal;
