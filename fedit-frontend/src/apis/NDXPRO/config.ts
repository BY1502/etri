import axios from 'axios';

const { hostname } = window.location;

const isLocalURL = hostname === 'localhost' || hostname === '172.16.28.222';
const SAMPLE_TOKEN = process.env.REACT_APP_TOKEN;

const BASE_URL = isLocalURL
  ? process.env.REACT_APP_API_URL
  : process.env.REACT_APP_API_OUTSIDE_URL;

export const VIEWER_URL = process.env.REACT_APP_VIEWER_URL;
export const PREDICTORTOOL_URL = process.env.REACT_APP_PREDICTOR_TOOL_URL;
export const DISCRETESIMULATORTOOL_URL =
  process.env.REACT_APP_DISCRETE_SIMULATOR_URL;
export const SERVICELOGICTOOL_URL =
  process.env.REACT_APP_SERVICE_LOGIC_TOOL_URL;
export const DIGITALSEARCH_URL = process.env.REACT_APP_DIGITAL_TWIN_SEARCH_URL;
export const DIGITALTWINMETADATAREGISTRATION_URL =
  process.env.REACT_APP_DIGITAL_TWIN_METADATA_REGISTRATION;
export const METADATA_VISUALIZATION_GRAPH =
  process.env.REACT_APP_METADATA_VISUALIZATION_GRAPH;
export const UNION_OBJECT_SYNC_ENGINE_MANAGEMENT =
  process.env.REACT_APP_UNION_OBJECT_SYNC_ENGINE_MANAGEMENT;
export const VERIFICATION_DATA_ADDITION_MANAGEMENT =
  process.env.REACT_APP_VERIFICATION_DATA_ADDITION_MANAGEMENT;

export const PREDICTION_MANAGER_URL =
  process.env.REACT_APP_PREDICTION_MANAGER_URL;
export const KUBEFLOW_URL = process.env.REACT_APP_KUBEFLOW_URL;
export const MLFLOW_URL = process.env.REACT_APP_MLFLOW_URL;
export const RAY_URL = process.env.REACT_APP_RAY_URL;
export const GRAFANA_URL = process.env.REACT_APP_GRAFANA_URL;
export const NIFI_URL = process.env.REACT_APP_NIFI_URL;

export const API = {
  MANAGER: `${BASE_URL}/ndxpro/v1/manager`,
  ATTRIBUTE: `${BASE_URL}/ndxpro/v1/manager`,
  ATTRIBUTE_SCHEMA: `${BASE_URL}/ndxpro/v1/manager/attribute-schemata`,
  CONTEXT: `${BASE_URL}/ndxpro/v1/manager/contexts`,
  MODEL: `${BASE_URL}/ndxpro/v1/manager/dataModels`,
  SERVICE: `${BASE_URL}/ndxpro/v1/service`,
  ENTITY: `${BASE_URL}/ndxpro/v1/service/entities`,
  STATISTICS: `${BASE_URL}/ndxpro/v1/broker/statistics`,
  LOGIN: `${BASE_URL}/ndxpro/v1/auth`,
  AUTH: `${BASE_URL}/ndxpro/v1/auth`,
  INGEST: `${BASE_URL}/ndxpro/v1/ingest`,
  TRANSLATOR: `${BASE_URL}/ndxpro/v1/translator`,
  FILESERVICE: `${BASE_URL}/ndxpro/v1/file-service`,
  VIEWER: `${VIEWER_URL}/api/fdt/tour/load`,
};

export const loginAPI = axios.create({
  baseURL: API.LOGIN,
  headers: {
    'Content-Type': `application/json;charset=UTF-8`,
    'Access-Control-Allow-Origin': '*',
    Accept: 'application/json',
  },
});

export const authAPI = axios.create({
  baseURL: API.AUTH,
  headers: {
    'Content-Type': `application/json;charset=UTF-8`,
    'Access-Control-Allow-Origin': '*',
    Accept: 'application/json',
    Authorization: `Bearer ${SAMPLE_TOKEN}`,
  },
});

export const managerAPI = axios.create({
  baseURL: API.MANAGER,
  headers: {
    'Content-Type': `application/json;charset=UTF-8`,
    'Access-Control-Allow-Origin': '*',
    Accept: 'application/json',
    Authorization: `Bearer ${SAMPLE_TOKEN}`,
  },
});

export const contextAPI = axios.create({
  baseURL: API.CONTEXT,
  headers: {
    'Content-Type': `application/json;charset=UTF-8`,
    'Access-Control-Allow-Origin': '*',
    Accept: 'application/json',
    Authorization: `Bearer ${SAMPLE_TOKEN}`,
  },
});

export const modelAPI = axios.create({
  baseURL: API.MODEL,
  headers: {
    'Content-Type': `application/json;charset=UTF-8`,
    'Access-Control-Allow-Origin': '*',
    Accept: 'application/json',
    Authorization: `Bearer ${SAMPLE_TOKEN}`,
  },
});

export const attributeAPI = axios.create({
  baseURL: API.ATTRIBUTE,
  headers: {
    'Content-Type': `application/json;charset=UTF-8`,
    'Access-Control-Allow-Origin': '*',
    Accept: 'application/json',
    Authorization: `Bearer ${SAMPLE_TOKEN}`,
  },
});

export const attributeSchemaAPI = axios.create({
  baseURL: API.ATTRIBUTE_SCHEMA,
  headers: {
    'Content-Type': `application/json;charset=UTF-8`,
    'Access-Control-Allow-Origin': '*',
    Accept: 'application/json',
    Authorization: `Bearer ${SAMPLE_TOKEN}`,
  },
});

export const entityAPI = axios.create({
  baseURL: API.ENTITY,
  headers: {
    'Content-Type': `application/json;charset=UTF-8`,
    'Access-Control-Allow-Origin': '*',
    Accept: 'application/json',
    Authorization: `Bearer ${SAMPLE_TOKEN}`,
  },
});

export const statisticsApi = axios.create({
  baseURL: API.STATISTICS,
  headers: {
    'Content-Type': `application/json;charset=UTF-8`,
    'Access-Control-Allow-Origin': '*',
    Accept: 'application/json',
    Authorization: `Bearer ${SAMPLE_TOKEN}`,
  },
});

export const IngestAPI = axios.create({
  baseURL: API.INGEST,
  headers: {
    'Content-Type': `application/json;charset=UTF-8`,
    'Access-Control-Allow-Origin': '*',
    Accept: 'application/json',
    Authorization: `Bearer ${SAMPLE_TOKEN}`,
  },
});

export const translatorAPI = axios.create({
  baseURL: API.TRANSLATOR,
  headers: {
    'Content-Type': `application/json;charset=UTF-8`,
    'Access-Control-Allow-Origin': '*',
    Accept: 'application/json',
    Authorization: `Bearer ${SAMPLE_TOKEN}`,
  },
});

export const fileServiceAPI = axios.create({
  baseURL: API.FILESERVICE,
  headers: {
    'Content-Type': `application/json;charset=UTF-8`,
    'Access-Control-Allow-Origin': '*',
    Accept: 'application/json',
    Authorization: `Bearer ${SAMPLE_TOKEN}`,
  },
});

export const viewerAPI = axios.create({
  baseURL: API.VIEWER,
  headers: {
    'Content-Type': `application/json;charset=UTF-8`,
    'Access-Control-Allow-Origin': '*',
    Accept: 'application/json',
    // Authorization: `Bearer ${SAMPLE_TOKEN}`,
  },
});
