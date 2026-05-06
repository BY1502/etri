import { useState } from 'react';
import { FormData } from 'types/trackingProcessForm';
import AccordionCollapse from './accordion-collapse';

function TrackingForm() {
  const [errorText, setErrorText] = useState('');
  const [errors, setErrors] = useState<{ [key: string]: boolean }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    reqIdentifier: '',
    callBackURL: '',
    trckProcInfo: [
      {
        trckTp: 'DTP',
        trckPrcIdtifier: '',
        federatedTwinId: '', // DTP 만 필수
        federatedDigitalObjectId: '', // DTP 만 필수
        digitalTwinId: '', // DTP 만 필수
        digitalObjId: '', // DTP 만 필수
        trckTopic: '', // DTP 만 필수
        trckValInfo: { digitalObjectPath: '', objValType: '' }, // DTP 만 필수
        evntDelay: null, // DTP 만 필수
        bufferSize: null, // DTP 만 필수
        dtFltTp: '', // DTP 만 필수
        evntCondition: {
          checkable: false,
          type: '',
          expression: { ctrlStatement: '' },
        },
        evntOccrCnt: 100,
        evntEndDt: { INTERVAL: 'HOURS', VALUE: 1 },
      },
    ],
  });

  const handleFormChange = (e: any, index: any, field: string) => {
    const { name, type, value, checked } = e.target; // Added 'type' and 'checked'

    if (type === 'checkbox') {
      // Handle checkbox input, toggle the boolean value
      setFormData((prev) => {
        const updatedInfo: any = [...prev.trckProcInfo];
        const keys = field.split('.');
        const updatedItem = { ...updatedInfo[index] };

        let currentObj: any = updatedItem;
        keys.forEach((key, idx) => {
          if (idx === keys.length - 1) {
            currentObj[key] = checked; // Toggle checkbox value
          } else {
            currentObj[key] = { ...currentObj[key] };
            currentObj = currentObj[key];
          }
        });

        updatedInfo[index] = updatedItem;
        return {
          ...prev,
          trckProcInfo: updatedInfo,
        };
      });
    } else {
      const inputValue = type === 'checkbox' ? checked : value;

      if (index === null) {
        setFormData((prevState) => ({
          ...prevState,
          [field]: inputValue, // Update the specific field
        }));
      } else {
        // Handle nested fields (e.g., trckProcInfo[index])
        setFormData((prev) => {
          const updatedInfo = [...prev.trckProcInfo];
          const keys = field.split('.');
          const updatedItem = { ...updatedInfo[index] };

          let currentObj: any = updatedItem;
          keys.forEach((key, idx) => {
            if (idx === keys.length - 1) {
              currentObj[key] = inputValue;
            } else {
              currentObj[key] = { ...currentObj[key] };
              currentObj = currentObj[key];
            }
          });

          updatedInfo[index] = updatedItem;
          return {
            ...prev,
            trckProcInfo: updatedInfo,
          };
        });
      }
    }
  };

  const addTrackingItem = () => {
    setFormData((prev) => ({
      ...prev,
      trckProcInfo: [
        ...prev.trckProcInfo,
        {
          trckTp: 'DTP',
          trckPrcIdtifier: '',
          federatedTwinId: '',
          federatedDigitalObjectId: '',
          digitalTwinId: '',
          digitalObjId: '',
          trckTopic: '',
          trckValInfo: { digitalObjectPath: '', objValType: '' },
          evntDelay: null,
          bufferSize: null,
          dtFltTp: '',
          evntCondition: {
            checkable: false,
            type: '',
            expression: { ctrlStatement: '' },
          },
          evntOccrCnt: 100,
          evntEndDt: { INTERVAL: 'HOURS', VALUE: 1 },
        },
      ],
    }));
  };

  const removeTrackingItem = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      trckProcInfo: prev.trckProcInfo.filter((_, i) => i !== index),
    }));
  };

  const getValueByPath = (path: string) => {
    const pathArray = path.split('.');
    let value: any = formData;

    if (pathArray.length === 1) {
      if (pathArray[0].includes('-')) {
        const [arrayKey, index] = pathArray[0].split('-');
        value = value.trckProcInfo[index][arrayKey]
          ? value.trckProcInfo[index][arrayKey]
          : undefined;
      } else {
        value = value[pathArray[0]];
      }
    } else if (pathArray[0] === 'trckValInfo') {
      if (pathArray[1].includes('-')) {
        const [arrayKey, index] = pathArray[1].split('-');
        value = value.trckProcInfo[index].trckValInfo[arrayKey]
          ? value.trckProcInfo[index].trckValInfo[arrayKey]
          : undefined;
      }
    } else if (pathArray[0] === 'evntEndDt') {
      if (pathArray[1].includes('-')) {
        const [arrayKey, index] = pathArray[1].split('-');
        value = value.trckProcInfo[index].evntEndDt[arrayKey]
          ? value.trckProcInfo[index].evntEndDt[arrayKey]
          : undefined;
      }
    } else if (pathArray[0] === 'evntCondition') {
      if (pathArray[1].includes('-')) {
        const [arrayKey, index] = pathArray[1].split('-');
        value = value.trckProcInfo[index].evntCondition[arrayKey]
          ? value.trckProcInfo[index].evntCondition[arrayKey]
          : undefined;
      } else if (pathArray[2].includes('-')) {
        const [arrayKey, index] = pathArray[2].split('-');
        value = value.trckProcInfo[index].evntCondition.expression[arrayKey]
          ? value.trckProcInfo[index].evntCondition.expression[arrayKey]
          : undefined;
      }
    }

    return value;
  };

  const validateForm = () => {
    setErrors({});
    const newErrors: { [key: string]: boolean } = {};

    const requiredFields = ['reqIdentifier', 'callBackURL'];

    formData.trckProcInfo.forEach((item, index) => {
      requiredFields.push(`trckPrcIdtifier-${index}`);
      requiredFields.push(`evntOccrCnt-${index}`);
      requiredFields.push(`evntCondition.type-${index}`);
      requiredFields.push(`evntCondition.expression.ctrlStatement-${index}`);
      requiredFields.push(`evntEndDt.VALUE-${index}`);
      requiredFields.push(`evntEndDt.INTERVAL-${index}`);

      if (item.trckTp === 'DTP') {
        requiredFields.push(
          `federatedTwinId-${index}`,
          `federatedDigitalObjectId-${index}`,
          `digitalTwinId-${index}`,
          `digitalObjId-${index}`,
          `trckTopic-${index}`,
          `trckValInfo.digitalObjectPath-${index}`,
          `trckValInfo.objValType-${index}`,
          `evntDelay-${index}`,
          `bufferSize-${index}`,
          `dtFltTp-${index}`,
        );
      }
    });

    requiredFields.forEach((field) => {
      const fieldValue = getValueByPath(field);
      if (!fieldValue) {
        newErrors[field] = true;
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const preparePayload = () => {
    const payload = {
      reqIdentifier: formData.reqIdentifier,
      callBackURL: formData.callBackURL,
      trckProcInfo: formData.trckProcInfo.map((item) => {
        const baseFields = {
          trckTp: item.trckTp,
          trckPrcIdtifier: item.trckPrcIdtifier,
          evntOccrCnt: item.evntOccrCnt,
          evntEndDt: item.evntEndDt,
          evntCondition: item.evntCondition,
        };

        // Add DTP-specific fields only if `trckTp` is "DTP" and the values are present
        if (item.trckTp === 'DTP') {
          return {
            ...baseFields,
            ...(item.federatedTwinId && {
              federatedTwinId: item.federatedTwinId,
            }),
            ...(item.federatedDigitalObjectId && {
              federatedDigitalObjectId: item.federatedDigitalObjectId,
            }),
            ...(item.digitalTwinId && { digitalTwinId: item.digitalTwinId }),
            ...(item.digitalObjId && { digitalObjId: item.digitalObjId }),
            ...(item.trckTopic && { trckTopic: item.trckTopic }),
            ...(item.trckValInfo.digitalObjectPath && {
              trckValInfo: {
                digitalObjectPath: item.trckValInfo.digitalObjectPath,
                objValType: item.trckValInfo.objValType,
              },
            }),
            ...(item.evntDelay && { evntDelay: item.evntDelay }),
            ...(item.bufferSize && { bufferSize: item.bufferSize }),
            ...(item.dtFltTp && { dtFltTp: item.dtFltTp }),
          };
        }
        // For ETP, only include non-empty base fields
        return {
          ...baseFields,
          ...(item.evntDelay && { evntDelay: item.evntDelay }),
          ...(item.bufferSize && { bufferSize: item.bufferSize }),
        };
      }),
    };

    return payload;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorText('');

    // Validate the form first
    if (validateForm()) {
      setIsSubmitting(true); // Set to true only after validation passes

      const payload = preparePayload();
      console.log('Payload:', payload);

      // Simulate form submission or send the payload to the server
      // TODO: fix this with actual submission handling
      setTimeout(() => {
        // After submission is complete (or response is received), reset isSubmitting
        setIsSubmitting(false);
      }, 2000); // This timeout is for example purposes; replace with actual submission handling.
    } else {
      setErrorText('Form contains errors');
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto mb-4 flex w-full min-w-[848px] max-w-[1100px] flex-col gap-[12px] rounded border bg-[var(--sky)] px-6 py-8"
    >
      <div className="flex">
        <div className="w-[340px]">
          <p className="font-bold">Request Identifier</p>
          <p className="mt-1 text-[var(--gray)]">트래킹 명령 요청 식별자</p>
        </div>
        <div className="flex-grow">
          <input
            name="reqIdentifier"
            value={formData.reqIdentifier}
            onChange={(e) => handleFormChange(e, null, 'reqIdentifier')}
            className={`w-full rounded-md border-[1.5px] border-solid ${errors.reqIdentifier ? 'border-red-500' : 'border-[var(--lightblue)]'} bg-white px-4 py-2`}
            placeholder="RQ-987"
          />
        </div>
      </div>

      <div className="flex">
        <div className="w-[340px]">
          <p className="font-bold">Callback URL</p>
          <p className="mt-1 text-[var(--gray)]">
            트래킹 이벤트 수신을 위한 응답 받을 URL
          </p>
        </div>
        <div className="flex-grow">
          <input
            name="callBackURL"
            value={formData.callBackURL}
            onChange={(e) => handleFormChange(e, null, 'callBackURL')}
            className={`w-full rounded-md border-[1.5px] border-solid ${errors.callBackURL ? 'border-red-500' : 'border-[var(--lightblue)]'} bg-white px-4 py-2`}
            placeholder="https://your-callback-url.com"
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-[16px] font-bold">
          트래킹 프로세스 정보 (Tracking Process Information)
        </h3>
        <button
          type="button"
          onClick={addTrackingItem}
          className="ml-auto flex w-[200px] items-center justify-center rounded-[4px] bg-[var(--blue)] px-[12px] py-[8px] text-white"
        >
          Add Process
        </button>
      </div>

      <AccordionCollapse
        formData={formData}
        handleFormChange={handleFormChange}
        errors={errors}
        removeTrackingItem={removeTrackingItem}
      />

      <div className="flex w-full flex-col items-end justify-end">
        {errorText && <p className="text-red-500">{errorText}</p>}
        <button
          type="submit"
          onClick={handleSubmit}
          disabled={isSubmitting}
          className={`mt-4 w-[200px] rounded px-4 py-2 text-white ${isSubmitting ? 'disabled bg-gray-400' : 'bg-[var(--blue)]'}`}
        >
          {isSubmitting ? (
            <>
              <span
                className="loader spinner-border text-light"
                role="status"
                aria-hidden="true"
              />
              <span className="ml-2">Submitting...</span>
            </>
          ) : (
            'Submit'
          )}
        </button>
      </div>
    </form>
  );
}

export default TrackingForm;
