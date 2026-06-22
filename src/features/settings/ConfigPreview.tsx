import type { OrbitConfig } from "./configSchema";

interface ConfigPreviewProps {
  config: OrbitConfig;
}

export function ConfigPreview({ config }: ConfigPreviewProps) {
  return (
    <section className="settings-panel" aria-labelledby="config-preview-title">
      <div className="section-heading">
        <span>配置</span>
        <h2 id="config-preview-title">草稿 JSON</h2>
      </div>

      <pre className="config-preview">{JSON.stringify(config, null, 2)}</pre>
    </section>
  );
}
