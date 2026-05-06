export interface FormData {
  reqIdentifier: string; // string - 트래킹 명령 요청 식별자
  callBackURL: string; // string - 트래킹 이벤트 수신을 위한 응답 받을 URL
  trckProcInfo: TrckProcInfo[]; // jsonArray - 데이터 / 이벤트 트래킹 프로세스 정보, 트래킹 프로세스 타입, 데이터 트래킹 인터페이스 정보 (Topic, Group) 정보, 데이터 주기, 데이터 필터 타입 등, 이벤트 발생 타입 및 이벤트 발생/종료에 대한 정보 등의 요소로 구성
}

export interface TrckProcInfo {
  trckTp: 'DTP' | 'ETP'; // string - 트래킹 프로세스 타입 (DTP: 데이터 트래킹 프로세스, ETP: 이벤트 트래킹 프로세스) - 필수
  trckPrcIdtifier: string; // string - 트래킹 프로세스 실행 시 단위 트래킹에 대한 식별자 - 필수
  federatedTwinId: string; // string - 연합 디지털트윈 식별자 - 데이터 트래킹 만 필수
  federatedDigitalObjectId: string; // string - 연합 디지털트윈 디지털객체 ID - 데이터 트래킹 만 필수
  digitalTwinId: string; // string - 단일 디지털 트윈 ID - 데이터 트래킹 만 필수
  digitalObjId: string; // string - 트래킹 요청할 디지털객체 ID - 데이터 트래킹 만 필수
  trckTopic: string; // string - 트래킹 프로세스 별 인터페이스 할 Topic - 데이터 트래킹 만 필수
  trckValInfo: TrckValInfo; // json - Data Tracking 처리 시 디지털트윈에서 트래킹 받을 값(패스) - 필수
  evntDelay: number | null; // long - Tracking 발생 주기 (밀리초: millisecond, ms) - 데이터 트래킹 만 필수
  bufferSize: number | null; // int - 1차 필터에 적용할 버퍼의 사이즈 (= 데이터 개수) - 데이터 트래킹 만 필수
  dtFltTp: string; // string - 데이터 필터 타입 (DF01(min), DF02(max), DF03(avg), DF04(sum), DF05(stdevp) 등 ) - 데이터 트래킹 만 필수
  evntCondition: EvntCondition; // json - 이벤트 발생 조건 - 필수
  // 아래 두개의 값이 미 적용일 경우 default 적용
  evntOccrCnt: number; // int - 트래킹 이벤트 발생 정보 전송 건수 이후 트래킹 종료 ( -1일 경우 미 적용, default: 100)
  evntEndDt: EvntEndDt; // json - 트래킹 이벤트 트래킹 시작 후 종료일(DATE) 까지 이벤트 전송
}

export interface TrckValInfo {
  digitalObjectPath: string;
  objValType: string;
}

export interface EvntCondition {
  checkable: boolean;
  type?: string;
  expression?: Expression;
}

export interface Expression {
  ctrlStatement: string; // "((#{DT-13} > 1 && #{DT-13} < 10) || (#{DT-23} > 90))" // string
}

export interface EvntEndDt {
  INTERVAL: 'SECONDS' | 'MINUTES' | 'HOURS' | 'DAYS' | '';
  VALUE: number;
}

export interface FormInputProps {
  label?: string;
  description?: string;
  required?: string;
  children: React.ReactNode;
}
