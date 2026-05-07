import HomeGrafanaIcon from 'assets/images/home/grafana.svg';
import HomeKatibIcon from 'assets/images/home/katib.svg';
import HomeKserveIcon from 'assets/images/home/kserve.svg';
import HomeMlflowIcon from 'assets/images/home/mlflow.svg';
import HomeNifiIcon from 'assets/images/home/nifi.svg';
import HomePipelineIcon from 'assets/images/home/pipeline.svg';
import HomePredictionManagerIcon from 'assets/images/home/prediction-manager.svg';
import HomeRayIcon from 'assets/images/home/ray-dashboard.svg';
import HomeTensorboardIcon from 'assets/images/home/tensorboard.svg';
import HomeVolumeIcon from 'assets/images/home/volume.svg';
import Layout from 'components/layout/layout';
import { useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';

import './predictor-creator-tool.scss';

// Kubeflow Central Dashboard postMessage 프로토콜
// https://github.com/kubeflow/kubeflow/blob/master/components/centraldashboard/public/library.js
const APP_CONNECTED_EVENT = 'iframe-connected';
const PARENT_CONNECTED_EVENT = 'parent-connected';
const NAMESPACE_SELECTED_EVENT = 'namespace-selected';

const LIGHT_MODE_DASHBOARD_STORAGE: Record<string, Record<string, string>> = {
  '/mlflow': {
    _mlflow_dark_mode_toggle_enabled: 'false',
    'databricks-dark-mode-pref': 'light',
  },
  '/ray': {
    themeMode: 'light',
  },
};

function applyLightModeDashboardDefaults(servicePath: string) {
  const storage = LIGHT_MODE_DASHBOARD_STORAGE[servicePath];
  if (!storage) return;

  Object.entries(storage).forEach(([key, value]) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Storage can be blocked in hardened browsers; the iframe still loads normally.
    }
  });
}

interface Service {
  name: string;
  description: string;
  icon: string;
  path: string;
  // Kubeflow 서비스인 경우 sub-path만 (ns는 동적으로)
  // 외부 서비스인 경우 url 직접
  kubeflowApp?: string; // ex: '/pipeline/', '/volumes/'
  url?: string; // ex: '/prediction-manager/'
  needsNamespace?: boolean;
  adminOnly?: boolean;
  externalUrl?: string; // 새 탭으로 열 외부 URL
}

const services: Service[] = [
  {
    name: '예측매니저',
    description: '이미지 빌드, 컨테이너 관리, GPU 모니터링',
    icon: HomePredictionManagerIcon,
    path: '/prediction-manager',
    url: '/prediction-manager/',
  },
  {
    name: 'AutoML',
    description: 'Ray Tune + Optuna 기반 자동 모델 탐색 / MLflow 연동',
    icon: HomeKatibIcon,
    path: '/automl',
    url: '/prediction-manager/?standalone=1#/automl',
  },
  {
    name: '모델 관리',
    description: 'MLflow 모델 레지스트리 버전/단계 관리, KServe 운영 배포',
    icon: HomeMlflowIcon,
    path: '/models',
    url: '/prediction-manager/?standalone=1#/models',
  },
  {
    name: '시스템 관리',
    description: '사용자 계정, 권한, 리소스 할당량 관리 (관리자 전용)',
    icon: HomePredictionManagerIcon,
    path: '/system-admin',
    url: '/prediction-manager/?standalone=1#/admin',
    adminOnly: true,
  },
  {
    name: '파이프라인',
    description: 'ML 파이프라인 생성, 실험, 실행 관리',
    icon: HomePipelineIcon,
    path: '/pipeline',
    kubeflowApp: '/pipeline/',
    needsNamespace: true,
  },
  {
    name: 'MLflow',
    description: '실험 추적, 모델 레지스트리, 모델 서빙',
    icon: HomeMlflowIcon,
    path: '/mlflow',
    url: '/prediction-manager/api/dashboards/mlflow/launch',
  },
  {
    name: 'Ray 대시보드',
    description: '분산 컴퓨팅 클러스터, HPO 작업 관리',
    icon: HomeRayIcon,
    path: '/ray',
    url: '/prediction-manager/api/dashboards/ray/launch',
  },
  {
    name: 'KServe 엔드포인트',
    description: '모델 서빙 엔드포인트 관리',
    icon: HomeKserveIcon,
    path: '/kserve',
    kubeflowApp: '/kserve-endpoints/',
    needsNamespace: true,
  },
  {
    name: '텐서보드',
    description: '학습 시각화 대시보드',
    icon: HomeTensorboardIcon,
    path: '/tensorboard',
    kubeflowApp: '/tensorboards/',
    needsNamespace: true,
  },
  {
    name: '볼륨',
    description: '영구 볼륨(PVC) 관리',
    icon: HomeVolumeIcon,
    path: '/volume',
    kubeflowApp: '/volumes/',
    needsNamespace: true,
  },
  {
    name: 'Grafana 모니터링',
    description: 'GPU/CPU 메트릭, Ray 클러스터 모니터링',
    icon: HomeGrafanaIcon,
    path: '/grafana',
    url: '/grafana/d/mlops-overview/?orgId=1&theme=light',
  },
  {
    name: 'Apache NiFi',
    description: '데이터 수집/전처리 파이프라인',
    icon: HomeNifiIcon,
    path: '/nifi',
    url: '/prediction-manager/api/nifi/launch',
  },
  {
    name: 'MLOps 모니터링',
    description: 'GPU/CPU, Ray, AutoML, KServe 상태 모니터링',
    icon: HomePredictionManagerIcon,
    path: '/monitoring',
    url: '/prediction-manager/?standalone=1#/monitoring',
  },
];

interface UserInfo {
  email: string;
  namespace: string;
  is_admin: boolean;
  accessible_namespaces: { namespace: string; role: string }[];
}

async function fetchUserInfo(): Promise<UserInfo> {
  try {
    const resp = await fetch('/prediction-manager/api/user-info', {
      credentials: 'include',
    });
    return await resp.json();
  } catch (e) {
    return {
      email: 'user@example.com',
      namespace: 'kubeflow-user-example-com',
      is_admin: false,
      accessible_namespaces: [
        { namespace: 'kubeflow-user-example-com', role: 'owner' },
      ],
    };
  }
}

const LOGOUT_URL =
  '/oauth2/sign_out?rd=https%3A%2F%2F121.183.206.41%3A30443%2Fauth%2Frealms%2Fkubeflow%2Fprotocol%2Fopenid-connect%2Flogout%3Fpost_logout_redirect_uri%3Dhttps%253A%252F%252F121.183.206.41%253A30443%252F%26client_id%3Dkubeflow-client';

function UserMenu({ userInfo }: { userInfo: UserInfo | null }) {
  const [open, setOpen] = useState(false);
  if (!userInfo) return null;
  const initial = (userInfo.email || 'U').charAt(0).toUpperCase();
  return (
    <div className="predictor-tool__user-menu">
      <button
        type="button"
        className="predictor-tool__user-btn"
        onClick={() => setOpen(!open)}
      >
        <span className="predictor-tool__user-avatar">{initial}</span>
        <span className="predictor-tool__user-email">{userInfo.email}</span>
        <span className="predictor-tool__user-arrow">▾</span>
      </button>
      {open && (
        <div className="predictor-tool__user-dropdown">
          <div className="predictor-tool__user-info-row">
            <div className="predictor-tool__user-info-label">이메일</div>
            <div className="predictor-tool__user-info-value">
              {userInfo.email}
            </div>
          </div>
          <div className="predictor-tool__user-info-row">
            <div className="predictor-tool__user-info-label">네임스페이스</div>
            <div className="predictor-tool__user-info-value">
              {userInfo.namespace}
            </div>
          </div>
          <div className="predictor-tool__user-info-row">
            <div className="predictor-tool__user-info-label">역할</div>
            <div className="predictor-tool__user-info-value">
              {userInfo.is_admin ? '관리자' : '일반 사용자'}
            </div>
          </div>
          <a href={LOGOUT_URL} className="predictor-tool__user-logout">
            로그아웃
          </a>
        </div>
      )}
    </div>
  );
}

function IframePage({ service }: { service: Service }) {
  const [isLoading, setIsLoading] = useState(true);
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [namespace, setNamespace] = useState<string>('');
  const [accessibleNs, setAccessibleNs] = useState<
    { namespace: string; role: string }[]
  >([]);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const navigate = useNavigate();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const isPmUrl = (u?: string) => !!u && u.includes('/prediction-manager/');

  const buildPmUrl = (baseUrl: string, ns: string) => {
    // baseUrl 형식: /prediction-manager/?standalone=1#/automl
    const [beforeHash, hash] = baseUrl.split('#');
    const url = new URL(beforeHash, window.location.origin);
    url.searchParams.set('ns', ns);
    return `${url.pathname}${url.search}${hash ? `#${hash}` : ''}`;
  };

  // 1. URL 결정 (Kubeflow 앱이면 namespace 조회 후, 아니면 즉시)
  useEffect(() => {
    let cancelled = false;
    const buildUrl = async () => {
      const info = await fetchUserInfo();
      if (cancelled) return;
      setUserInfo(info);
      applyLightModeDashboardDefaults(service.path);
      if (service.kubeflowApp) {
        setAccessibleNs(info.accessible_namespaces || []);
        setNamespace(info.namespace);
        setIframeUrl(`${service.kubeflowApp}?ns=${info.namespace}`);
      } else if (service.url) {
        setAccessibleNs(info.accessible_namespaces || []);
        setNamespace(info.namespace);
        if (isPmUrl(service.url)) {
          setIframeUrl(buildPmUrl(service.url, info.namespace));
        } else {
          setIframeUrl(service.url);
        }
      }
    };
    buildUrl();
    return () => {
      cancelled = true;
    };
  }, [service]);

  // namespace 변경 시 iframe URL 업데이트
  const handleNamespaceChange = (newNs: string) => {
    setNamespace(newNs);
    setIsLoading(true);
    if (service.kubeflowApp) {
      setIframeUrl(`${service.kubeflowApp}?ns=${newNs}`);
    } else if (service.url && isPmUrl(service.url)) {
      setIframeUrl(buildPmUrl(service.url, newNs));
    }
  };

  // 2. iframe 로드 후 postMessage로 namespace 전달
  useEffect(() => {
    if (!service.kubeflowApp || !namespace) {
      return undefined;
    }

    const handleMessage = (event: MessageEvent) => {
      // Kubeflow sub-app이 'iframe-connected' 보내면 응답
      if (event.data?.type === APP_CONNECTED_EVENT) {
        const iframe = iframeRef.current;
        if (!iframe || !iframe.contentWindow) return;
        // PARENT_CONNECTED 응답
        iframe.contentWindow.postMessage(
          { type: PARENT_CONNECTED_EVENT, value: null },
          event.origin || '*',
        );
        // NAMESPACE 전달
        iframe.contentWindow.postMessage(
          { type: NAMESPACE_SELECTED_EVENT, value: namespace },
          event.origin || '*',
        );
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [service, namespace]);

  const handleLoad = () => {
    setIsLoading(false);
    // 일부 앱은 onload 이후에도 namespace 메시지를 받아야 함
    if (service.kubeflowApp && namespace && iframeRef.current?.contentWindow) {
      setTimeout(() => {
        iframeRef.current?.contentWindow?.postMessage(
          { type: NAMESPACE_SELECTED_EVENT, value: namespace },
          '*',
        );
      }, 500);
    }
  };

  const visibleQuickNav = services.filter(
    (s) => !s.adminOnly || userInfo?.is_admin,
  );

  return (
    <div className="predictor-tool__iframe-wrapper">
      <div className="predictor-tool__toolbar">
        <button
          type="button"
          className="predictor-tool__back-btn"
          onClick={() => navigate('/predictor-creator-tool')}
        >
          &larr;
        </button>
        <div className="predictor-tool__quick-nav">
          {visibleQuickNav.map((svc) => (
            <button
              key={svc.path}
              type="button"
              className={`predictor-tool__quick-nav-item ${
                svc.path === service.path ? 'active' : ''
              }`}
              onClick={() => {
                if (svc.externalUrl) {
                  window.open(svc.externalUrl, '_blank', 'noopener,noreferrer');
                } else {
                  navigate(`/predictor-creator-tool${svc.path}`);
                }
              }}
              title={svc.name}
            >
              <img src={svc.icon} alt={svc.name} />
              <span>{svc.name}</span>
            </button>
          ))}
        </div>
        {(service.kubeflowApp || isPmUrl(service.url)) &&
          accessibleNs.length > 0 && (
            <select
              className="predictor-tool__ns-select"
              value={namespace}
              onChange={(e) => handleNamespaceChange(e.target.value)}
            >
              {accessibleNs.map((ns) => (
                <option key={ns.namespace} value={ns.namespace}>
                  {ns.namespace} ({ns.role})
                </option>
              ))}
            </select>
          )}
        <UserMenu userInfo={userInfo} />
      </div>
      {isLoading && (
        <div className="loading-mask">
          <div className="loading-mask__spinner" />
        </div>
      )}
      {iframeUrl && (
        <iframe
          ref={iframeRef}
          title={service.name}
          src={iframeUrl}
          className="predictor-tool__iframe"
          onLoad={handleLoad}
        />
      )}
    </div>
  );
}

function ToolHome() {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetchUserInfo().then((info) => setIsAdmin(!!info.is_admin));
  }, []);

  const visibleServices = services.filter((s) => !s.adminOnly || isAdmin);

  return (
    <div className="predictor-tool__home">
      <div className="predictor-tool__header">
        <h2>예측기 생성/연동 도구</h2>
        <p>MLOps 플랫폼 서비스에 접속합니다.</p>
      </div>
      <div className="predictor-tool__grid">
        {visibleServices.map((svc) => (
          <div
            key={svc.name}
            className="card"
            role="button"
            tabIndex={0}
            onClick={() => {
              if (svc.externalUrl) {
                window.open(svc.externalUrl, '_blank', 'noopener,noreferrer');
              } else {
                navigate(`/predictor-creator-tool${svc.path}`);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (svc.externalUrl) {
                  window.open(svc.externalUrl, '_blank', 'noopener,noreferrer');
                } else {
                  navigate(`/predictor-creator-tool${svc.path}`);
                }
              }
            }}
          >
            <div className="card__icon-div">
              <img className="card__icon" src={svc.icon} alt={svc.name} />
            </div>
            <p className="card__subtitle">{svc.description}</p>
            <p className="card__title">{svc.name}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PredictorCreatorTool() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<ToolHome />} />
        <Route
          path="/notebook"
          element={<Navigate to="/predictor-creator-tool" replace />}
        />
        {services
          .filter((svc) => !svc.externalUrl)
          .map((svc) => (
            <Route
              key={svc.path}
              path={svc.path}
              element={<IframePage service={svc} />}
            />
          ))}
      </Routes>
    </Layout>
  );
}
