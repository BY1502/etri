import { useState } from 'react';

import { ReactComponent as ArrowDown } from 'assets/images/arrow_down.svg';
import { ReactComponent as ArrowUp } from 'assets/images/arrow_up_ndxpro.svg';
import { ReactComponent as Close } from 'assets/images/close.svg';
import FormInput from 'components/formInput/formInput';

function AccordionCollapse({
  formData,
  handleFormChange,
  errors,
  removeTrackingItem,
}: any) {
  const [expanded, setExpanded] = useState<any>([]);

  const toggleAccordion = (index: any) => {
    setExpanded((prev: any) => {
      if (prev.includes(index)) {
        return prev.filter((item: any) => item !== index);
      }
      return [...prev, index];
    });
  };

  return (
    <>
      {formData.trckProcInfo.map((item: any, index: any) => (
        <div
          // eslint-disable-next-line react/no-array-index-key
          key={item + index}
          className="flex flex-col gap-[12px] rounded-md bg-gray-200 px-[16px] py-[8px]"
        >
          <div className="flex justify-between">
            <div className="flex gap-[24px]">
              <div>
                <p className="font-bold">Tracking Type</p>
                <p className="text-[var(--gray)]">트래킹 프로세스 타입</p>
                <select
                  value={item.trckTp}
                  onChange={(e) => handleFormChange(e, index, 'trckTp')}
                  className={`w-[300px] rounded-md border-[1.5px] border-solid ${errors[`trckTp-${index}`] ? 'border-red-500' : 'border-[var(--lightblue)]'} bg-white px-4 py-2`}
                >
                  <option value="DTP">DTP (Data Tracking Process)</option>
                  <option value="ETP">ETP (Event Tracking Process)</option>
                </select>
              </div>

              <div>
                <p className="font-bold">Tracking Process Identifier</p>
                <p className="text-[var(--gray)]">
                  {' '}
                  트래킹 프로세스 실행 시 단위 트래킹에 대한 식별자
                </p>
                <input
                  name="trckPrcIdtifier"
                  value={item.trckPrcIdtifier}
                  onChange={(e) =>
                    handleFormChange(e, index, 'trckPrcIdtifier')
                  }
                  placeholder="DT-13"
                  className={`w-[300px] rounded-md border-[1.5px] border-solid ${errors[`trckPrcIdtifier-${index}`] ? 'border-red-500' : 'border-[var(--lightblue)]'} bg-white px-4 py-2`}
                />
              </div>
            </div>

            <div className="flex items-center gap-[12px]">
              <button
                type="button"
                className="flex h-[32px] w-[32px] cursor-pointer items-center justify-center rounded-full bg-white text-white"
                onClick={() => toggleAccordion(index)} // Toggle accordion on click
                onKeyPress={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    toggleAccordion(index);
                  }
                }}
              >
                {/* Show arrow up if expanded, arrow down if not */}
                {expanded.includes(index) ? <ArrowUp /> : <ArrowDown />}
              </button>
              <button
                type="button"
                onClick={() => removeTrackingItem(index)}
                className="flex h-[32px] w-[32px] cursor-pointer items-center justify-center rounded-full bg-white text-white"
              >
                <Close />
              </button>
            </div>
          </div>

          {/* Accordion Content */}
          {expanded.includes(index) && ( // Only render the content if this accordion is expanded
            <>
              <FormInput
                label="Federated Twin ID"
                description="연합 디지털트윈 식별자"
                required="데이터 트래킹 만 필수"
              >
                <input
                  name="federatedTwinId"
                  value={item.federatedTwinId}
                  onChange={(e) =>
                    handleFormChange(e, index, 'federatedTwinId')
                  }
                  placeholder="KR-02-K10000-20240000"
                  className={`w-full rounded-md border-[1.5px] border-solid ${errors[`federatedTwinId-${index}`] ? 'border-red-500' : 'border-[var(--lightblue)]'} bg-white px-4 py-2`}
                />
              </FormInput>

              <FormInput
                label="Federated Digital Object ID"
                description="연합 디지털트윈 디지털객체 ID"
                required="데이터 트래킹 만 필수"
              >
                <input
                  name="federatedDigitalObjectId"
                  value={item.federatedDigitalObjectId}
                  placeholder="F-KR-104111-0011"
                  onChange={(e) =>
                    handleFormChange(e, index, 'federatedDigitalObjectId')
                  }
                  className={`w-full rounded-md border-[1.5px] border-solid ${errors[`federatedDigitalObjectId-${index}`] ? 'border-red-500' : 'border-[var(--lightblue)]'} bg-white px-4 py-2`}
                />
              </FormInput>

              <FormInput
                label="Digital Twin ID"
                description="단일 디지털 트윈 ID"
                required="데이터 트래킹 만 필수"
              >
                <input
                  name="digitalTwinId"
                  value={item.digitalTwinId}
                  placeholder="KR-109941-0004"
                  onChange={(e) => handleFormChange(e, index, 'digitalTwinId')}
                  className={`w-full rounded-md border-[1.5px] border-solid ${errors[`digitalTwinId-${index}`] ? 'border-red-500' : 'border-[var(--lightblue)]'} bg-white px-4 py-2`}
                />
              </FormInput>

              <FormInput
                label="Digital Object ID"
                description="트래킹 요청할 디지털객체 ID"
                required="데이터 트래킹 만 필수"
              >
                <input
                  name="digitalObjId"
                  value={item.digitalObjId}
                  placeholder="KR-109941-0004"
                  onChange={(e) => handleFormChange(e, index, 'digitalObjId')}
                  className={`w-full rounded-md border-[1.5px] border-solid ${errors[`digitalObjId-${index}`] ? 'border-red-500' : 'border-[var(--lightblue)]'} bg-white px-4 py-2`}
                />
              </FormInput>

              <FormInput
                label="Track Topic"
                description="트래킹 프로세스 별 인터페이스 할 Topic"
                required="데이터 트래킹 만 필수"
              >
                <input
                  name="trckTopic"
                  value={item.trckTopic}
                  onChange={(e) => handleFormChange(e, index, 'trckTopic')}
                  placeholder="FDO_F-KR-104111-0011"
                  className={`w-full rounded-md border-[1.5px] border-solid ${errors[`trckTopic-${index}`] ? 'border-red-500' : 'border-[var(--lightblue)]'} bg-white px-4 py-2`}
                />
              </FormInput>

              <FormInput
                label="Tracking Value Info"
                description=" 트래킹 대상으로 처리할 데이터 값 (Path) 입력"
                required="데이터 트래킹 만 필수"
              >
                <div className="flex w-full flex-col gap-[12px] rounded-md border-[1.5px] border-solid border-[var(--lightblue)] bg-slate-50 px-4 py-[24px]">
                  <div className="flex items-center justify-between">
                    <div className="w-full">
                      <p className="font-bold">Digital Object Path</p>
                      <p className="mt-1 text-[var(--gray)]">
                        메타정보 중 단일트윈 하부 구조 정보를 설정
                      </p>
                    </div>
                    <input
                      type="text"
                      name="digitalObjectPath"
                      placeholder="weatherMeasurement..list..wind_vvv"
                      value={item.trckValInfo.digitalObjectPath}
                      onChange={(e) =>
                        handleFormChange(
                          e,
                          index,
                          'trckValInfo.digitalObjectPath',
                        )
                      }
                      className={`w-full rounded-md border-[1.5px] border-solid ${errors[`trckValInfo.digitalObjectPath-${index}`] ? 'border-red-500' : 'border-[var(--lightblue)]'} bg-white px-4 py-2`}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="w-full">
                      <p className="font-bold">Object Value Type</p>
                      <p className="mt-1 text-[var(--gray)]">
                        처리되는 데이터 타입 정의
                      </p>
                    </div>
                    <select
                      value={item.trckValInfo.objValType}
                      name="objectValueType"
                      onChange={(e) =>
                        handleFormChange(e, index, 'trckValInfo.objValType')
                      }
                      className={`w-full rounded-md border-[1.5px] border-solid ${errors[`trckValInfo.objValType-${index}`] ? 'border-red-500' : 'border-[var(--lightblue)]'} bg-white px-4 py-2`}
                    >
                      <option value="" disabled>
                        Select an Object Type
                      </option>
                      <option value="INTEGER">INTEGER</option>
                      <option value="STRING">STRING</option>
                      <option value="FLOAT">FLOAT</option>
                      <option value="BOOLEAN">BOOLEAN</option>
                      <option value="DOUBLE">DOUBLE</option>
                      <option value="LONG">LONG</option>
                    </select>
                  </div>
                </div>
              </FormInput>

              <FormInput
                label="Event Delay (ms)"
                description="Tracking 발생 주기"
                required="데이터 트래킹 만 필수"
              >
                <input
                  type="number"
                  name="evntDelay"
                  value={item.evntDelay ?? ''}
                  placeholder="30000"
                  onChange={(e) => handleFormChange(e, index, 'evntDelay')}
                  className={`w-full rounded-md border-[1.5px] border-solid ${errors[`evntDelay-${index}`] ? 'border-red-500' : 'border-[var(--lightblue)]'} bg-white px-4 py-2`}
                />
              </FormInput>

              <FormInput
                label="Buffer Size"
                description="1차 필터에 적용할 버퍼의 사이즈"
                required="데이터 트래킹 만 필수"
              >
                <input
                  type="input"
                  name="bufferSize"
                  value={item.bufferSize ?? ''}
                  placeholder="100"
                  onChange={(e) => handleFormChange(e, index, 'bufferSize')}
                  className={`w-full rounded-md border-[1.5px] border-solid ${errors[`bufferSize-${index}`] ? 'border-red-500' : 'border-[var(--lightblue)]'} bg-white px-4 py-2`}
                />
              </FormInput>

              <FormInput
                label="Data Filter Type"
                description="데이터 필터 타입"
                required="데이터 트래킹 만 필수"
              >
                <select
                  value={item.dtFltTp}
                  onChange={(e) => handleFormChange(e, index, 'dtFltTp')}
                  className={`w-full rounded-md border-[1.5px] border-solid ${errors[`dtFltTp-${index}`] ? 'border-red-500' : 'border-[var(--lightblue)]'} bg-white px-4 py-2`}
                >
                  <option value="" disabled>
                    Select a data filter type
                  </option>
                  <option value="DF01">DF01 (min)</option>
                  <option value="DF02">DF02 (max)</option>
                  <option value="DF03">DF03 (average)</option>
                  <option value="DF04">DF04 (sum)</option>
                  <option value="DF05">DF05 (stdevp)</option>
                </select>
              </FormInput>

              <FormInput label="Event Condition" description="이벤트 발생 조건">
                <div className="flex w-full flex-col gap-[12px] rounded-md border-[1.5px] border-solid border-[var(--lightblue)] bg-slate-50 px-4 py-[24px]">
                  <div className="flex items-center justify-between">
                    <div className="w-full">
                      <p className="font-bold">Event Condition Checkable</p>
                      <p className="mt-1 text-[var(--gray)]">
                        발생조건 체크 및 발생 데이터 전송 여부
                      </p>
                    </div>
                    <div className="relative flex w-full items-center">
                      <div className="inline-flex items-center">
                        <label className="relative flex cursor-pointer items-center">
                          <input
                            type="checkbox"
                            checked={item?.evntCondition?.checkable ?? false}
                            onChange={(e) =>
                              handleFormChange(
                                e,
                                index,
                                'evntCondition.checkable',
                              )
                            }
                            className="peer h-[24px] w-[24px] cursor-pointer appearance-none rounded-md border-[1.5px] border-solid border-[var(--lightblue)] bg-white transition-all checked:border-[var(--lightblue)]"
                            id="check"
                          />
                          <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transform text-[var(--blue)] opacity-0 peer-checked:opacity-100">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-[18px] w-[18px]"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                              stroke="currentColor"
                              strokeWidth="1"
                            >
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="w-full">
                      <p className="font-bold">Event Condition Type</p>
                      <p className="mt-1 text-[var(--gray)]">이벤트 종류</p>
                    </div>
                    <select
                      name="eventConditionType"
                      value={item?.evntCondition?.type ?? ''}
                      onChange={(e) =>
                        handleFormChange(e, index, 'evntCondition.type')
                      }
                      className={`w-full rounded-md border-[1.5px] border-solid ${errors[`evntCondition.type-${index}`] ? 'border-red-500' : 'border-[var(--lightblue)]'} bg-white px-4 py-2`}
                    >
                      <option value="" disabled>
                        Select an Event Type
                      </option>
                      <option value="CP">CP</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="w-full">
                      <p className="font-bold">Control Statement</p>
                      <p className="mt-1 text-[var(--gray)]">
                        결과 값이 치환할 변수 위치
                      </p>
                    </div>
                    <input
                      name="ctrlStatement"
                      placeholder="((#{DT-13} > 1 && #{DT-13} < 10) || (#{DT-23} > 90))"
                      value={
                        item?.evntCondition?.expression?.ctrlStatement ?? ''
                      }
                      onChange={(e) =>
                        handleFormChange(
                          e,
                          index,
                          'evntCondition.expression.ctrlStatement',
                        )
                      }
                      className={`w-full rounded-md border-[1.5px] border-solid ${errors[`evntCondition.expression.ctrlStatement-${index}`] ? 'border-red-500' : 'border-[var(--lightblue)]'} bg-white px-4 py-2`}
                    />
                  </div>
                </div>
              </FormInput>

              <FormInput
                label="Event Occur Count"
                description="-1일 경우 미 적용, default: 100"
              >
                <input
                  type="number"
                  name="evntOccrCnt"
                  value={item.evntOccrCnt ?? ''}
                  onChange={(e) => handleFormChange(e, index, 'evntOccrCnt')}
                  className={`w-full rounded-md border-[1.5px] border-solid ${errors[`evntOccrCnt-${index}`] ? 'border-red-500' : 'border-[var(--lightblue)]'} bg-white px-4 py-2`}
                  placeholder="-1"
                />
              </FormInput>

              <FormInput
                label="Event End Date"
                description="트래킹 이벤트 트래킹 시작 후 종료일(DATE) 까지 이벤트 전송"
              >
                <div className="flex items-center gap-4">
                  <input
                    type="number"
                    name="evntEndDt"
                    value={item.evntEndDt.VALUE ?? ''}
                    onChange={(e) =>
                      handleFormChange(e, index, 'evntEndDt.VALUE')
                    }
                    className={`w-full rounded-md border-[1.5px] border-solid ${errors[`evntEndDt.VALUE-${index}`] ? 'border-red-500' : 'border-[var(--lightblue)]'} bg-white px-4 py-2`}
                    placeholder="3"
                  />

                  <select
                    value={item.evntEndDt.INTERVAL}
                    name="evntEndDtSelect"
                    onChange={(e) =>
                      handleFormChange(e, index, 'evntEndDt.INTERVAL')
                    }
                    className={`w-full rounded-md border-[1.5px] border-solid ${errors[`evntEndDt.INTERVAL-${index}`] ? 'border-red-500' : 'border-[var(--lightblue)]'} bg-white px-4 py-2`}
                  >
                    <option value="" disabled>
                      Select Interval
                    </option>
                    <option value="SECONDS">SECONDS</option>
                    <option value="MINUTES">MINUTES</option>
                    <option value="HOURS">HOURS</option>
                    <option value="DAYS">DAYS</option>
                  </select>
                </div>
              </FormInput>
            </>
          )}
        </div>
      ))}
    </>
  );
}

export default AccordionCollapse;
