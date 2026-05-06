import Layout from 'components/layout/layout';
import TrackingForm from 'components/trackingForm/tracking-form';

export default function DynamicDataEventTrackingProcess() {
  return (
    <Layout>
      <div className="h-full w-full px-[19px] py-[20px]">
        <p className="mb-[32px] text-[18px] font-bold">
          동적 데이터 / 이벤트 트레킹 프로세스
        </p>
        <div className="mt-[48px]">
          <p className="mb-[12px] text-[14px] font-bold">
            인터페이스 정의 (Tracking Command)
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border border-gray-300 bg-white">
              <thead>
                <tr className="bg-[var(--sky)]">
                  <th className="border-b border-gray-300 px-4 py-2 text-left font-semibold">
                    구분
                  </th>
                  <th className="border-b border-gray-300 px-4 py-2 text-left font-semibold">
                    Description
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="odd:bg-white even:bg-gray-50">
                  <td className="border-b border-gray-300 px-4 py-2">용도</td>
                  <td className="border-b border-gray-300 px-4 py-2">
                    3세부 서비스 운영 (시각화 Process) 모듈은
                    트래킹(데이터/이벤트) 받고자 하는 정보를 요청 시 트래킹
                    명령을 구성하여 트래킹 모듈에 요청 전송
                  </td>
                </tr>
                <tr className="odd:bg-white even:bg-gray-50">
                  <td className="border-b border-gray-300 px-4 py-2">
                    프로토콜
                  </td>
                  <td className="border-b border-gray-300 px-4 py-2">
                    HTTP Protocol 사용
                  </td>
                </tr>
                <tr className="odd:bg-white even:bg-gray-50">
                  <td className="border-b border-gray-300 px-4 py-2">URL</td>
                  <td className="border-b border-gray-300 px-4 py-2">
                    http://serviceIP:8002/fdt/detrck/rcv/tracking-commands
                  </td>
                </tr>
                <tr className="odd:bg-white even:bg-gray-50">
                  <td className="border-b border-gray-300 px-4 py-2">Method</td>
                  <td className="border-b border-gray-300 px-4 py-2">POST</td>
                </tr>
                <tr className="odd:bg-white even:bg-gray-50">
                  <td className="border-b border-gray-300 px-4 py-2">
                    Content-Type
                  </td>
                  <td className="border-b border-gray-300 px-4 py-2">
                    application/json
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="my-[48px]">
          <p className="mb-[12px] text-[14px] font-bold">
            트래킹 요청 정의 (Tracking Command)
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border border-gray-300 bg-white">
              <thead>
                <tr className="bg-[var(--sky)]">
                  <th className="border-b border-gray-300 px-4 py-2 text-left font-semibold">
                    Name
                  </th>
                  <th className="border-b border-gray-300 px-4 py-2 text-left font-semibold">
                    Type
                  </th>
                  <th className="border-b border-gray-300 px-4 py-2 text-left font-semibold">
                    Description
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="odd:bg-white even:bg-gray-50">
                  <td className="border-b border-gray-300 px-4 py-2">
                    requestIdtifier
                  </td>
                  <td className="border-b border-gray-300 px-4 py-2">String</td>
                  <td className="border-b border-gray-300 px-4 py-2">
                    <ul>
                      <li>트래킹 명령 요청 식별자</li>
                      <li>트래킹 요청 시 단위 요청에 대한 식별자</li>
                      <li>트래킹 이벤트 정보에 포함되어 전송</li>
                    </ul>
                  </td>
                </tr>
                <tr className="odd:bg-white even:bg-gray-50">
                  <td className="border-b border-gray-300 px-4 py-2">
                    callBackURL
                  </td>
                  <td className="border-b border-gray-300 px-4 py-2">String</td>
                  <td className="border-b border-gray-300 px-4 py-2">
                    <ul>
                      <li>트래킹 이벤트 수신을 위한 응답 받을 URL</li>
                    </ul>
                  </td>
                </tr>
                <tr className="odd:bg-white even:bg-gray-50">
                  <td className="border-b border-gray-300 px-4 py-2">
                    trckProcInfo[]
                  </td>
                  <td className="border-b border-gray-300 px-4 py-2">
                    JsonArray
                  </td>
                  <td className="border-b border-gray-300 px-4 py-2">
                    <ul>
                      <li>데이터 / 이벤트 트래킹 프로세스 정보</li>
                      <li>
                        트래킹 프로세스 타입, 데이터 트래킹 인터페이스
                        정보(Topic, Group) 정보, 데이터 주기, 데이터 필터 타입
                        등
                      </li>
                      <li>
                        이벤트 발생 타입 및 이벤트 발생/종료에 대한 정보 등의
                        요소로 구성
                      </li>
                    </ul>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <TrackingForm />
      </div>
    </Layout>
  );
}
