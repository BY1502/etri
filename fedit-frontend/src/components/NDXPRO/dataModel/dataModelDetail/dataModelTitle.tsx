function DataModelTitle({
  id,
  uri,
  isReady,
}: {
  id: string;
  uri: string;
  isReady: boolean;
}) {
  return (
    <div className="new-data-model-title">
      <h1>{id}</h1>
      <p>{uri}</p>
      {isReady && <span>Ready</span>}
    </div>
  );
}

export default DataModelTitle;
