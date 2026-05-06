import AdminManagement from 'pages/admin-management/admin-management';
import ApiDocument from 'pages/api-document/api-document';
import DigitalTwinMetadataManagement from 'pages/digital-twin-metadata-management/digital-twin-metadata-management';
import DigitalTwinProcessingManagement from 'pages/digital-twin-processing-management/digital-twin-processing-management';
import DiscreteContinuousSimulationMergeTool from 'pages/discrete-continuous-simulation-merge-tool/discrete-continuous-simulation-merge-tool';
import DynamicDataEventTrackingProcess from 'pages/dynamic-data-event-tracking-process/dynamic-data-event-tracking-process';
import Home from 'pages/home/home';
import ModelInformationViewer from 'pages/model-information-viewer/model-information-viewer';
import NoticeBoardManagement from 'pages/notice-board-management/notice-board-management';
import PhysicalSimulationProcessingTool from 'pages/physical-simulation-processing-tool/physical-simulation-processing-tool';
import PredictorCreatorTool from 'pages/predictor-creator-tool/predictor-creator-tool';
import RegisterUnionTwin from 'pages/register-union-twin/register-union-twin';
import ServiceDescriptionTool from 'pages/service-description-tool/service-description-tool';
import UserManagement from 'pages/user-management/user-management';
import { Route, Routes } from 'react-router-dom';

export default function Base() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/admin-management/*" element={<AdminManagement />} />
      {/* <Route path="/dashboard/*" element={<Home />} /> */}
      <Route
        path="/digital-twin-metadata-management/*"
        element={<DigitalTwinMetadataManagement />}
      />
      <Route
        path="/digital-twin-processing-management/*"
        element={<DigitalTwinProcessingManagement />}
      />
      <Route
        path="/discrete-continuous-simulation-merge-tool/*"
        element={<DiscreteContinuousSimulationMergeTool />}
      />
      <Route
        path="/notice-board-management/*"
        element={<NoticeBoardManagement />}
      />
      <Route
        path="/physical-simulation-processing-tool/*"
        element={<PhysicalSimulationProcessingTool />}
      />
      <Route
        path="/predictor-creator-tool/*"
        element={<PredictorCreatorTool />}
      />
      <Route
        path="/service-description-tool/*"
        element={<ServiceDescriptionTool />}
      />
      <Route path="/register-union-twin" element={<RegisterUnionTwin />} />
      <Route path="/user-management/*" element={<UserManagement />} />
      <Route
        path="/model-information-viewer"
        element={<ModelInformationViewer />}
      />
      <Route
        path="/model-information-viewer-reload"
        element={<ModelInformationViewer reload />}
      />
      <Route path="api-document/*" element={<ApiDocument />} />
      <Route
        path="dynamic-data-event-tracking-process"
        element={<DynamicDataEventTrackingProcess />}
      />
    </Routes>
  );
}
