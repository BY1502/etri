import APIIcon from 'assets/images/api.svg';
import CubeIcon from 'assets/images/cube_icon.svg';
import DigitalTwinMetaDataIcon from 'assets/images/digital_twin_metadata_icon.svg';
import MemberIcon from 'assets/images/member_icon.svg';
import NoticeBoardIcon from 'assets/images/notice_board_icon.svg';
import PredictorIcon from 'assets/images/predictor_icon.svg';
import SettingsIcon from 'assets/images/settings.svg';
import TreeIcon from 'assets/images/tree_icon.svg';

import FormSubmitIcon from 'assets/images/form-submit.svg';
import HomeAnnouncementManagementIcon from 'assets/images/home/announcement-management.svg';
import HomeDigitalTwinSearchIcon from 'assets/images/home/digital-twin-search.svg';
import HomeDiscreteContinuousSimulationMergeToolIcon from 'assets/images/home/discrete-continuous-simulation-merge-tool.svg';
import HomeModelManagementIcon from 'assets/images/home/model-management.svg';
import HomeObjectDataModelManagementIcon from 'assets/images/home/object-data-model-management.svg';
import HomePhysicalSimulationProcessingToolIcon from 'assets/images/home/physical-simulation-processing-tool.svg';
import HomePredictorCreatorToolIcon from 'assets/images/home/predictor-creator-tool.svg';
import HomeServiceLogicToolIcon from 'assets/images/home/service-logic-tool.svg';
import HomeUsersListIcon from 'assets/images/home/users-list.svg';

export const pages = [
  {
    name: '회원 관리',
    icon: MemberIcon,
    // homeIcon: HomeUsersListIcon,
    path: '/user-management',
    auth: 'admin',
    toggle: false,
    childNav: [
      {
        name: '회원 목록',
        homeIcon: HomeUsersListIcon,
        path: '/users-list',
        auth: 'admin',
      },
    ],
  },
  // {
  //   name: '운영자 관리',
  //   icon: AdminIcon,
  //   homeIcon: HomeUsersListIcon,
  //   path: '/admin-management',
  //   auth: 'admin',
  //   toggle: false,
  //   childNav: [
  //     {
  //       name: '운영자 명단',
  //       homeIcon: HomeUsersListIcon,
  //       path: '/admins-list',
  //       auth: 'admin',
  //     },
  //     {
  //       name: '운영자 그룹 관리',
  //       homeIcon: HomeAdminGroupIcon,
  //       path: '/admins-group',
  //       auth: 'admin',
  //     },
  //     {
  //       name: '운영자 그룹 권한 관리',
  //       homeIcon: HomeAdminRolesIcon,
  //       path: '/admins-roles',
  //       auth: 'admin',
  //     },
  //   ],
  // },
  {
    name: '게시판 관리',
    icon: NoticeBoardIcon,
    // homeIcon: HomeAnnouncementManagementIcon,
    path: '/notice-board-management',
    auth: 'user',
    toggle: false,
    childNav: [
      {
        name: '공지사항',
        homeIcon: HomeAnnouncementManagementIcon,
        path: '/announcement',
        auth: 'user',
      },
      {
        name: '공지사항 관리',
        homeIcon: HomeAnnouncementManagementIcon,
        path: '/announcement-management',
        auth: 'user',
      },
    ],
  },
  {
    name: '디지털트윈 메타데이터 관리',
    icon: DigitalTwinMetaDataIcon,
    homeIcon: HomeDigitalTwinSearchIcon,
    path: '/digital-twin-metadata-management',
    auth: 'user',
    toggle: false,
    childNav: [
      {
        name: '디지털 트윈 메타데이터 검색',
        homeIcon: DigitalTwinMetaDataIcon,
        path: '/digital-twin-search',
        auth: 'user',
      },
      {
        name: '디지털 트윈 메타데이터 등록',
        homeIcon: DigitalTwinMetaDataIcon,
        path: '/digital-twin-metadata-registeration',
        auth: 'user',
      },
      {
        name: '메타데이터 시각 그래프',
        homeIcon: DigitalTwinMetaDataIcon,
        path: '/metadata-visualization-graph',
        auth: 'user',
      },
    ],
  },
  {
    name: '디지털트윈 프로세싱 관리',
    icon: DigitalTwinMetaDataIcon,
    homeIcon: HomeDigitalTwinSearchIcon,
    path: '/digital-twin-processing-management',
    auth: 'user',
    toggle: false,
    childNav: [
      {
        name: '연합 객체 및 동기화 엔진 관리',
        homeIcon: DigitalTwinMetaDataIcon,
        path: '/union-object-sync-engine-management',
        auth: 'user',
      },
      {
        name: '유효성 검증 및 데이터 증강 도구 관리',
        homeIcon: DigitalTwinMetaDataIcon,
        path: '/verification-data-addition-management',
        auth: 'user',
      },
    ],
  },
  {
    name: '서비스 디스크립션 도구',
    icon: SettingsIcon,
    // homeIcon: HomeObjectDataModelManagementIcon,
    path: '/service-description-tool',
    auth: 'user',
    toggle: false,
    childNav: [
      {
        name: '속성 관리',
        homeIcon: HomeModelManagementIcon,
        path: '/model-management',
        auth: 'user',
      },
      // {
      //   name: '모델 속성 스키마 관리',
      //   homeIcon: HomeModelManagementIcon,
      //   path: '/model-schema-management',
      //   auth: 'user',
      // },
      {
        name: '엔터티 Type 모델링',
        homeIcon: HomeObjectDataModelManagementIcon,
        path: '/object-data-model-management',
        auth: 'user',
      },
      // {
      //   name: '모델 컨텍스트',
      //   homeIcon: HomeModelManagementIcon,
      //   path: '/model-context-management',
      //   auth: 'user',
      // },
      {
        name: '엔터티조회',
        homeIcon: HomeModelManagementIcon,
        path: '/entity-management',
        auth: 'user',
      },
      {
        name: '수집설정',
        homeIcon: HomeModelManagementIcon,
        path: '/agent',
        auth: 'user',
      },
      {
        name: '수집현황',
        homeIcon: HomeModelManagementIcon,
        path: '/statistics',
        auth: 'user',
      },
      {
        name: '서비스 로직 저작',
        homeIcon: HomeServiceLogicToolIcon,
        path: '/service-logic-tool',
        auth: 'user',
      },
    ],
  },
  {
    name: '예측기 생성/연동 도구',
    icon: PredictorIcon,
    homeIcon: HomePredictorCreatorToolIcon,
    path: '/predictor-creator-tool',
    auth: 'user',
  },
  {
    name: '물리 시물레이션 전후처리 도구',
    icon: CubeIcon,
    homeIcon: HomePhysicalSimulationProcessingToolIcon,
    path: '/physical-simulation-processing-tool',
    auth: 'user',
  },
  {
    name: '이산 연속 시뮬레이션 조합 도구',
    icon: TreeIcon,
    homeIcon: HomeDiscreteContinuousSimulationMergeToolIcon,
    path: '/discrete-continuous-simulation-merge-tool',
    auth: 'user',
  },
  {
    name: 'API 및 문서 링크',
    icon: APIIcon,
    homeIcon: APIIcon,
    path: '/api-document',
    auth: 'user',
    toggle: false,
    childNav: [
      {
        name: '제주시 공기질 API',
        homeIcon: APIIcon,
        path: '/jeju-api',
        auth: 'user',
      },
      // {
      //   name: '시각화 엔진 사용 가이드',
      //   homeIcon: APIIcon,
      //   path: '/vizwide3d-guide',
      //   auth: 'user',
      // },
    ],
  },
  {
    name: '동적 데이터/이벤트 트래킹 프로세스',
    icon: FormSubmitIcon,
    homeIcon: FormSubmitIcon,
    path: '/dynamic-data-event-tracking-process',
    auth: 'user',
  },
];
