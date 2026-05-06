import { ReactComponent as DownloadFileIcon } from 'assets/images/download-file.svg';
import { ReactComponent as ExeIcon } from 'assets/images/exe-file.svg';
import Layout from 'components/layout/layout';

import { getDownloadFiles, getLogicalFilesUFID } from 'apis/NDXPRO/fileService';
import { useState } from 'react';
import { buildStyles, CircularProgressbar } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import './physical-simulation-processing-tool.scss';

export default function PhysicalSimulationProcessingTool() {
  const [progress, setProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const filename = 'DTEditor.zip';

  // Download file function triggered after clicking download
  const handleDownload = async () => {
    try {
      setIsDownloading(true);
      setProgress(10);

      // Step 1: Fetch the ufId
      const ufidData = await getLogicalFilesUFID(filename);

      setProgress(30);

      const ufid = ufidData?.list[0]?.ufId;
      if (!ufid) {
        throw new Error('File not found');
      }

      // Step 2: Fetch the download file using the ufId
      const response = await getDownloadFiles(ufid, {
        onDownloadProgress: (progressEvent: any) => {
          const total = progressEvent.total || 1;
          const currentProgress = Math.round(
            (progressEvent.loaded * 100) / total,
          );
          setProgress(Math.round(30 + currentProgress * 0.7));
        },
      });

      // Step 3: Handle file download
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Failed to download the file', error);
      alert('파일을 다운로드하는 데 문제가 발생했습니다.');
    } finally {
      setIsDownloading(false);
      setProgress(0);
    }
  };

  return (
    <Layout>
      <div
        className={`physical-simulation-processing-tool ${
          isDownloading ? 'blurred' : ''
        }`}
      >
        <p className="physical-simulation-processing-tool__title">
          물리 시물레이션 전후처리 도구
        </p>

        <div className="physical-simulation-processing-tool__providing-tool-box">
          <p className="physical-simulation-processing-tool__providing-tool-box-title">
            제공 기능
          </p>
          <div>
            <p className="physical-simulation-processing-tool__providing-tool-box-subtitle">
              물리 시물레이션 해석을 위한 전처리 기능 제공(해석 설정, 경계 조건
              등)
            </p>
            <p className="physical-simulation-processing-tool__providing-tool-box-subtitle">
              LBM 해석 결과 데이터의 3차원 시각화 및 스트림 출력 기능 제공
            </p>
            {/* <p className="physical-simulation-processing-tool__providing-tool-box-subtitle">
              애니메이션 타임라인 매칭 및 시점 편집 기능 제공
            </p> */}
          </div>
        </div>

        <div className="physical-simulation-processing-tool__download-tool-box">
          <div className="physical-simulation-processing-tool__download-tool-box-wrapper">
            <p className="physical-simulation-processing-tool__download-tool-box-title">
              설치 가이드
            </p>
            <div>
              <p className="physical-simulation-processing-tool__download-tool-box-subtitle">
                어떻게 사용할 수 있나요?
              </p>
              <p className="physical-simulation-processing-tool__download-tool-box-subtitle">
                오른쪽 사용하기 버튼을 클릭하시면 다운로드가 가능합니다.
              </p>
            </div>
          </div>

          <div className="physical-simulation-processing-tool__download-tool-box-icon-div">
            <div className="physical-simulation-processing-tool__download-tool-box-icon-wrapper">
              <ExeIcon />
            </div>

            <button
              type="button"
              onClick={handleDownload}
              className="physical-simulation-processing-tool__download-tool-box-button"
              disabled={isDownloading}
            >
              <DownloadFileIcon />
              {isDownloading ? '다운로드 중...' : '사용하기'}
            </button>
          </div>
        </div>

        {isDownloading && (
          <div className="physical-simulation-processing-tool__overlay">
            <CircularProgressbar
              className="physical-simulation-processing-tool__download-icon"
              value={progress}
              text={`${progress}%`}
              styles={buildStyles({
                textColor: '#000',
                pathColor: 'var(--blue)',
                trailColor: '#fff',
              })}
            />
          </div>
        )}
      </div>
    </Layout>
  );
}
