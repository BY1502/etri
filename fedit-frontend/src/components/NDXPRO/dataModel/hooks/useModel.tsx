import { postModelData, putModel } from 'apis/NDXPRO/modelApi';
import { useEffect, useState } from 'react';
import { useRecoilState } from 'recoil';
import {
  modelAttributeAtom,
  modelInfoAtom,
} from 'store/dataModel/dataModelAtom';
import {
  attributesToArray,
  attributesToObject,
  modelInfoFilter,
} from 'utils/dataModelUtils';

export const useModel = (data: any) => {
  const [attributes, setAttributes] = useRecoilState(modelAttributeAtom);
  const [modelInfo, setModelInfo] = useRecoilState(modelInfoAtom);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const upperCase = (text: string) => {
    return `${text?.charAt(0).toUpperCase()}${text?.slice(1)}`;
  };

  const create = () => {
    const info = modelInfoFilter(modelInfo);

    if (!info.type) {
      setErrorMessage('Type is a required value. You have to check [Type]');
      return;
    }

    if (attributes.length === 0) {
      setErrorMessage(
        'Attributes is a required value. You have to check [Attributes]',
      );
      return;
    }

    if (!window.confirm('Would you like to create a Data Model?')) {
      return;
    }

    const obj = {
      ...modelInfoFilter(info),
      ...attributesToObject(attributes),
      id: `urn:ngsi-ld:${upperCase(info.type)}:`,
      type: upperCase(info.type),
    };

    postModelData(obj)
      .then((res) => {
        alert(res);
        window.location.replace(`new-data-model/${info.type}`);
      })
      .catch((err) => {
        setErrorMessage(
          `${err.response.data.title} : ${err.response.data.detail}`,
        );
      });
  };

  const update = () => {
    const info = modelInfoFilter(modelInfo);

    if (!info.type || !info.id) {
      setErrorMessage('Type is a required value. You have to check [Type]');
      return;
    }

    if (attributes.length === 0) {
      setErrorMessage(
        'Attributes is a required value. You have to check [Attributes]',
      );
      return;
    }

    if (!window.confirm(`Would you like to update [${info.type}]?`)) {
      return;
    }

    const obj = {
      ...info,
      ...attributesToObject(attributes),
    };

    putModel(info.id, obj)
      .then((res) => {
        alert(res);
        window.location.reload();
      })
      .catch((err) => {
        setErrorMessage(
          `${err.response.data.title} : ${err.response.data.detail}`,
        );
      });
  };

  useEffect(() => {
    if (!data) {
      return;
    }
    setAttributes(() =>
      attributesToArray(data.attributeNames, data.attributes),
    );
    setModelInfo({
      id: data.id,
      type: data.type,
      title: data.title,
      description: data.description,
      reference: data.reference,
    });
  }, [data]);

  return { create, update, errorMessage, setErrorMessage };
};
