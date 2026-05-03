export default function ErrorScreen({ title, message, hint, error }) {
  return (
    <div className="error-screen">
      <div className="error-card">
        <div className="error-icon">!</div>
        <h1 className="error-title">{title}</h1>
        <p className="error-message">{message}</p>
        {error && (
          <div className="error-detail">
            <span className="error-detail-label">Detalle técnico</span>
            <code>{error}</code>
          </div>
        )}
        {hint && <div className="error-hint">{hint}</div>}
      </div>
    </div>
  );
}
