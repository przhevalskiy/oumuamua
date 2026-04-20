'use client';

import { useAgentConfigStore, DEFAULT_CONFIG, type AgentModel, type AgentConfig } from '@/lib/agent-config-store';

const MODEL_OPTIONS: { value: AgentModel; label: string }[] = [
  { value: 'default',          label: 'Default (Sonnet 4.6)' },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (cheaper)' },
];

const SWARM_AGENTS: { key: keyof AgentConfig; label: string; hint: string }[] = [
  { key: 'modelArchitect', label: 'Architect', hint: 'Maps repo, plans tracks — keep Sonnet' },
  { key: 'modelBuilder',   label: 'Builder',   hint: 'Writes code — Sonnet recommended' },
  { key: 'modelInspector', label: 'Inspector', hint: 'Runs QA, generates heal instructions' },
  { key: 'modelSecurity',  label: 'Security',  hint: 'Scans for secrets and CVEs' },
  { key: 'modelDevOps',    label: 'DevOps',    hint: 'Git, branch, PR — Haiku is fine' },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: '0.6875rem',
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      color: 'var(--text-secondary)',
      marginBottom: '0.875rem',
    }}>
      {children}
    </p>
  );
}

function SettingRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0.625rem 0',
      borderBottom: '1px solid var(--border)',
      gap: '1rem',
    }}>
      <div>
        <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)' }}>{label}</p>
        {hint && <p style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>{hint}</p>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function SliderInput({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: 100, accentColor: 'var(--accent)', cursor: 'pointer' }}
      />
      <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', minWidth: 24, textAlign: 'right' }}>
        {value}
      </span>
    </div>
  );
}

function TextInput({ value, placeholder, onChange }: { value: string; placeholder?: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      style={{
        fontSize: '0.8125rem',
        color: 'var(--text-primary)',
        background: 'var(--surface-raised)',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        padding: '0.3rem 0.6rem',
        fontFamily: 'monospace',
        width: 220,
        outline: 'none',
      }}
    />
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: 40, height: 22, borderRadius: 999,
        background: checked ? 'var(--accent)' : 'var(--surface-raised)',
        border: '1px solid ' + (checked ? 'var(--accent)' : 'var(--border)'),
        cursor: 'pointer', position: 'relative',
        transition: 'background 0.15s, border 0.15s', padding: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: checked ? 20 : 2,
        width: 16, height: 16, borderRadius: '50%', background: '#fff',
        transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </button>
  );
}

function Select({ value, options, onChange }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        fontSize: '0.8125rem',
        color: 'var(--text-primary)',
        background: 'var(--surface-raised)',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        padding: '0.3rem 0.5rem',
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function ConfigPanel() {
  const { config, setConfig, resetConfig, isDirty } = useAgentConfigStore();
  const dirty = isDirty();

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '2.5rem 2rem' }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '0.25rem' }}>
            Configuration
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Tune the swarm without touching code.
          </p>
        </div>
        {dirty && (
          <button
            onClick={resetConfig}
            style={{
              fontSize: '0.8125rem', color: 'var(--text-secondary)',
              background: 'transparent', border: '1px solid var(--border)',
              borderRadius: '8px', padding: '0.375rem 0.75rem',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Reset to defaults
          </button>
        )}
      </div>

      {/* Swarm Factory */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.875rem' }}>
          <SectionLabel>Swarm Factory</SectionLabel>
          <span style={{
            fontSize: '0.6rem', fontWeight: 600, color: '#f97316',
            background: '#f9731615', padding: '0.1rem 0.4rem',
            borderRadius: '999px', textTransform: 'uppercase',
            letterSpacing: '0.06em', marginBottom: '0.875rem',
          }}>
            Durable
          </span>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '0 1rem' }}>
          <SettingRow label="Repo path" hint="Absolute path to the repo the swarm will build in">
            <TextInput
              value={config.swarmRepoPat}
              placeholder="/path/to/your/repo"
              onChange={v => setConfig({ swarmRepoPat: v })}
            />
          </SettingRow>
          <SettingRow label="Branch prefix" hint="Git branches will be named prefix/task-id">
            <TextInput
              value={config.swarmBranchPrefix}
              placeholder="swarm"
              onChange={v => setConfig({ swarmBranchPrefix: v })}
            />
          </SettingRow>
          <SettingRow label="Max parallel tracks" hint="How many Builder agents run simultaneously">
            <SliderInput value={config.swarmMaxParallelTracks} min={1} max={6} onChange={v => setConfig({ swarmMaxParallelTracks: v })} />
          </SettingRow>
          <SettingRow label="Max heal cycles" hint="How many times the Inspector can send the Builder back to fix failures">
            <SliderInput value={config.swarmMaxHealCycles} min={1} max={5} onChange={v => setConfig({ swarmMaxHealCycles: v })} />
          </SettingRow>
        </div>
      </div>

      {/* Model per agent */}
      <div style={{ marginBottom: '2rem' }}>
        <SectionLabel>Model per Agent</SectionLabel>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '0 1rem' }}>
          {SWARM_AGENTS.map(({ key, label, hint }) => (
            <SettingRow key={String(key)} label={label} hint={hint}>
              <Select
                value={config[key] as string}
                options={MODEL_OPTIONS}
                onChange={v => setConfig({ [key]: v as AgentModel } as Partial<AgentConfig>)}
              />
            </SettingRow>
          ))}
        </div>
      </div>

      {/* Display */}
      <div>
        <SectionLabel>Display</SectionLabel>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '0 1rem' }}>
          <SettingRow label="Show agent tags in feed" hint="Shows [Architect], [Builder (frontend)], [Inspector] etc. in the activity log">
            <Toggle checked={config.showAgentTagsInFeed} onChange={v => setConfig({ showAgentTagsInFeed: v })} />
          </SettingRow>
        </div>
      </div>

    </div>
  );
}
